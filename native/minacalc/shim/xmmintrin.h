#pragma once
#include <cmath>

typedef float __minacalc_m128;

static inline __minacalc_m128
_mm_load_ss(const float* p)
{
	return *p;
}

static inline void
_mm_store_ss(float* p, __minacalc_m128 v)
{
	*p = v;
}

static inline __minacalc_m128
_mm_mul_ss(__minacalc_m128 a, __minacalc_m128 b)
{
	return a * b;
}

static inline __minacalc_m128
_mm_rsqrt_ss(__minacalc_m128 a)
{
	return 1.0F / sqrtf(a);
}
