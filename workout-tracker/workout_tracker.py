exercise = input("What exercise did you do? ")
weight = input("How much weight (lbs)? ")
sets = input("How many sets? ")
reps = input("How many reps? ")
import csv
from datetime import datetime

# All the input() lines go here first, then:

with open("workouts.csv", "a") as f:
    writer = csv.writer(f)
    writer.writerow([datetime.now().strftime("%Y-%m-%d"), exercise, weight, sets, reps])

print("Workout saved!")

