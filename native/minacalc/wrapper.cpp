#include "MinaCalc/MinaCalc.h"
#include <vector>

extern "C" {

int
msd_version()
{
	return GetCalcVersion();
}

Calc*
msd_create()
{
	return new Calc;
}

void
msd_destroy(Calc* calc)
{
	delete calc;
}

int
msd_compute(Calc* calc,
			const unsigned* masks,
			const float* times,
			int num_rows,
			unsigned keycount,
			float music_rate,
			float* out8)
{
	std::vector<NoteInfo> rows(static_cast<size_t>(num_rows));
	for (int i = 0; i < num_rows; i++) {
		rows[i].notes = masks[i];
		rows[i].rowTime = times[i];
	}
	const auto result =
	  MinaSDCalc(rows, music_rate, 0.93F, keycount, false, calc);
	const int n = static_cast<int>(result.size()) < 8
					? static_cast<int>(result.size())
					: 8;
	for (int i = 0; i < n; i++) {
		out8[i] = result[static_cast<size_t>(i)];
	}
	return n;
}
}
