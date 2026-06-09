import csv

workouts = []

with open("workouts.csv", "r") as f:
    reader = csv.reader(f)
    for row in reader:
        workouts.append(row)

print(f"Total workouts: {len(workouts)}")

# Group by exercise
exercises = {}
for workout in workouts:
    date, exercise, weight, sets, reps = workout
    weight = int(weight)
    
    if exercise not in exercises:
        exercises[exercise] = []
    exercises[exercise].append(weight)

# Average and max weight per exercise
print("\nAverage weight per exercise:")
for exercise, weights in exercises.items():
    avg = sum(weights) / len(weights)
    print(f"  {exercise}: {avg:.1f} lbs")

print("\nHeaviest lift per exercise:")
for exercise, weights in exercises.items():
    max_weight = max(weights)
    print(f"  {exercise}: {max_weight} lbs")