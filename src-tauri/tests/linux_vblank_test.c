// Headless protocol tests: the real driver and mode queries are mocked, while
// the production adapter and its absolute monotonic timer run unchanged.
#define dlsym mock_dlsym
#include "../src/linux_vblank.c"
#undef dlsym
#include <assert.h>
#include <fcntl.h>
#include <string.h>
#include <unistd.h>

static int driver_error = EOPNOTSUPP;
static int mode_queries;
static uint32_t crtc_ids[] = { 42 };
static drmModeRes mock_resources = { .count_crtcs = 1, .crtcs = crtc_ids };
static drmModeCrtc mock_crtc = {
    .mode_valid = 1,
    .mode = { .clock = 729000, .htotal = 2700, .vtotal = 1500, .vscan = 1 },
};

static int mock_wait(int fd, drmVBlankPtr vblank) {
    (void)fd;
    (void)vblank;
    errno = driver_error;
    return driver_error ? -1 : 0;
}

void *mock_dlsym(void *handle, const char *name) {
    (void)handle;
    assert(strcmp(name, "drmWaitVBlank") == 0);
    return (void *)mock_wait;
}

drmModeResPtr drmModeGetResources(int fd) {
    (void)fd;
    mode_queries++;
    return &mock_resources;
}
drmModeCrtcPtr drmModeGetCrtc(int fd, uint32_t id) {
    (void)fd;
    assert(id == 42);
    return &mock_crtc;
}
void drmModeFreeResources(drmModeResPtr resources) { (void)resources; }
void drmModeFreeCrtc(drmModeCrtcPtr crtc) { (void)crtc; }

static void rejected(int fd, drmVBlankReq request, int expected_errno) {
    drmVBlank vblank = { .request = request };
    errno = 0;
    assert(drmWaitVBlank(fd, &vblank) == -1);
    assert(errno == expected_errno);
}

int main(void) {
    int fd = open("/dev/null", O_RDWR);
    assert(fd >= 0);
    drmVBlankReq query = { .type = DRM_VBLANK_RELATIVE };

    // Explicit opt-out, supported drivers and permission failures pass through.
    cascade_vblank_compat_init(0);
    rejected(fd, query, EOPNOTSUPP);
    cascade_vblank_compat_init(1);
    driver_error = EACCES;
    rejected(fd, query, EACCES);
    driver_error = 0;
    drmVBlank supported = { .request = query };
    assert(drmWaitVBlank(fd, &supported) == 0);
    assert(mode_queries == 0);
    driver_error = EOPNOTSUPP;

    // Only WebKit's relative, zero-signal, single-frame operations are adapted.
    rejected(fd, (drmVBlankReq){ .type = DRM_VBLANK_ABSOLUTE }, EOPNOTSUPP);
    rejected(fd, (drmVBlankReq){ .type = DRM_VBLANK_RELATIVE, .sequence = 2 }, EOPNOTSUPP);
    rejected(fd, (drmVBlankReq){ .type = DRM_VBLANK_RELATIVE, .signal = 42 }, EOPNOTSUPP);
    rejected(fd, (drmVBlankReq){ .type = DRM_VBLANK_RELATIVE | DRM_VBLANK_EVENT }, EOPNOTSUPP);
    assert(mode_queries == 0);

    drmVBlank initial = { .request = query };
    assert(drmWaitVBlank(fd, &initial) == 0);
    drmVBlank next = { .request = { .type = DRM_VBLANK_RELATIVE, .sequence = 1 } };
    assert(drmWaitVBlank(fd, &next) == 0);
    assert(next.reply.sequence > initial.reply.sequence);
    assert(mode_queries == 1);

    // Missing device/mode data must not manufacture a successful driver reply.
    rejected(-1, query, EOPNOTSUPP);
    int other_fd = dup(fd);
    assert(other_fd >= 0);
    mock_crtc.mode_valid = 0;
    rejected(other_fd, query, EOPNOTSUPP);
    close(other_fd);
    close(fd);
    puts("Linux vblank adapter: driver passthrough, request boundaries, pacing, and missing mode tests passed");
    return 0;
}
