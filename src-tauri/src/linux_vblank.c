// WebKit's DRM monitor falls back to a fixed 60 Hz timer when NVIDIA rejects
// drmWaitVBlank. Emulate only its unsupported relative query/wait requests at
// the active CRTC's rate. EGL/Wayland still controls actual frame presentation.
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <time.h>
#include <xf86drm.h>
#include <xf86drmMode.h>

typedef int (*wait_vblank_fn)(int, drmVBlankPtr);
static wait_vblank_fn real_wait;
static pthread_once_t resolve_once = PTHREAD_ONCE_INIT;
static atomic_int fallback_enabled;

void cascade_vblank_compat_init(int enabled) {
    atomic_store(&fallback_enabled, enabled);
}

static void resolve_wait(void) {
    real_wait = (wait_vblank_fn)dlsym(RTLD_NEXT, "drmWaitVBlank");
}

uint64_t cascade_frame_period_ns(uint32_t clock_khz, uint32_t htotal,
                                uint32_t vtotal, uint32_t flags, uint32_t vscan) {
    if (!clock_khz || !htotal || !vtotal) return 0;
    uint64_t period = 1000000ULL * htotal * vtotal / clock_khz;
    if (flags & DRM_MODE_FLAG_INTERLACE) period /= 2;
    if (flags & DRM_MODE_FLAG_DBLSCAN) period *= 2;
    if (vscan > 1) period *= vscan;
    // Reject invalid modes rather than creating a busy loop or a long stall.
    return period >= 500000 && period <= 100000000 ? period : 0;
}

uint64_t cascade_next_frame_ns(uint64_t now, uint64_t period) {
    return period ? (now / period + 1) * period : 0;
}

static uint64_t monotonic_ns(void) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    return (uint64_t)now.tv_sec * 1000000000ULL + now.tv_nsec;
}

static uint64_t display_period(int fd, unsigned crtc_index, uint64_t now) {
    // WebKit has one waiting thread per monitor. Cache on that thread, checking
    // the active mode again each second to follow refresh-rate changes. Device
    // identity prevents reusing a cached mode when an fd number is recycled.
    static _Thread_local int previous_fd = -1;
    static _Thread_local dev_t previous_device;
    static _Thread_local unsigned previous_crtc;
    static _Thread_local uint64_t period, checked_at;
    struct stat info;
    if (fstat(fd, &info) != 0) return 0;
    if (fd == previous_fd && info.st_rdev == previous_device &&
        crtc_index == previous_crtc && now - checked_at < 1000000000ULL)
        return period;
    previous_fd = fd;
    previous_device = info.st_rdev;
    previous_crtc = crtc_index;
    checked_at = now;
    period = 0;
    drmModeRes *resources = drmModeGetResources(fd);
    if (!resources) return 0;
    if (crtc_index < (unsigned)resources->count_crtcs) {
        drmModeCrtc *crtc = drmModeGetCrtc(fd, resources->crtcs[crtc_index]);
        if (crtc) {
            if (crtc->mode_valid) {
                drmModeModeInfo *mode = &crtc->mode;
                period = cascade_frame_period_ns(mode->clock, mode->htotal,
                    mode->vtotal, mode->flags, mode->vscan);
            }
            drmModeFreeCrtc(crtc);
        }
    }
    drmModeFreeResources(resources);
    return period;
}

int drmWaitVBlank(int fd, drmVBlankPtr vblank) {
    pthread_once(&resolve_once, resolve_wait);
    if (!real_wait) { errno = ENOSYS; return -1; }
    if (!vblank) return real_wait(fd, vblank);
    drmVBlankReq request = vblank->request;
    int result = real_wait(fd, vblank);
    int driver_errno = errno;
    if (result == 0 || !atomic_load(&fallback_enabled) ||
        (driver_errno != EOPNOTSUPP && result != -EOPNOTSUPP))
        return result;

    // Do not emulate absolute waits, events, signals, or multi-frame requests.
    // In particular, permission/device errors must retain their real behavior.
    unsigned allowed = DRM_VBLANK_RELATIVE | DRM_VBLANK_SECONDARY |
        DRM_VBLANK_HIGH_CRTC_MASK;
    if (!(request.type & DRM_VBLANK_RELATIVE) ||
        ((unsigned)request.type & ~allowed) || request.sequence > 1 || request.signal) {
        errno = driver_errno;
        return result;
    }
    unsigned crtc = (request.type & DRM_VBLANK_HIGH_CRTC_MASK) >> DRM_VBLANK_HIGH_CRTC_SHIFT;
    if (!crtc && (request.type & DRM_VBLANK_SECONDARY)) crtc = 1;
    uint64_t now = monotonic_ns();
    uint64_t period = display_period(fd, crtc, now);
    if (!period) { errno = driver_errno; return result; }

    static _Thread_local int reported;
    if (!reported && getenv("CASCADE_RENDER_DIAGNOSTICS")) {
        fprintf(stderr, "[cascade rendering] Unsupported NVIDIA vblank: pacing CRTC %u at %.2f Hz\n",
            crtc, 1000000000.0 / period);
        reported = 1;
    }
    if (request.sequence) {
        uint64_t next = cascade_next_frame_ns(now, period);
        struct timespec deadline = { next / 1000000000ULL, next % 1000000000ULL };
        int sleep_result;
        do {
            sleep_result = clock_nanosleep(CLOCK_MONOTONIC, TIMER_ABSTIME, &deadline, NULL);
        } while (sleep_result == EINTR);
        if (sleep_result) { errno = sleep_result; return -1; }
        now = monotonic_ns();
    }
    vblank->reply.type = request.type;
    vblank->reply.sequence = (uint32_t)(now / period);
    vblank->reply.tval_sec = now / 1000000000ULL;
    vblank->reply.tval_usec = (now % 1000000000ULL) / 1000;
    return 0;
}
