# Workout Tracker

A tiny command-line workout logger and analyzer. Two early learning scripts that share a CSV data file.

## Files

- `workout_tracker.py` — prompts for an exercise (name, weight, sets, reps) and appends a dated row to `workouts.csv`.
- `workout_analyzer.py` — reads `workouts.csv` and prints stats: total workouts, average weight per exercise, and heaviest lift per exercise.
- `workouts.csv` — the data file. Columns: `date, exercise, weight, sets, reps` (no header row).

## Usage

Run from inside this folder so the scripts find `workouts.csv`:

```bash
cd workout-tracker

# Log a workout
python workout_tracker.py

# See your stats
python workout_analyzer.py
```

No dependencies beyond the Python standard library.
