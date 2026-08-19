/**
 * The exercise catalogue, as pipe-delimited rows.
 *
 * Deliberately a flat text block rather than 250 object literals: it stays
 * scannable, diffs cleanly, and is easy to extend by hand. `parseExerciseRows`
 * validates every column against the schema enums, so a typo fails the seed
 * rather than landing in the database.
 *
 *   name | movement pattern | primary muscle | equipment | secondary muscles | flags | aliases
 *
 * flags: c = compound, u = unilateral, x = explosive/plyometric
 *
 * `x` marks movements trained for speed rather than load — jumps, throws, and
 * the Olympic lifts. They share a movement pattern and target muscle with
 * ordinary strength work but are not interchangeable with it, so the
 * substitution engine refuses to cross that line in either direction.
 */
export const EXERCISE_ROWS = `
# ---------- horizontal push ----------
Barbell Bench Press | horizontal_push | chest | barbell | triceps,front_delts | c | bench,flat bench,bench press
Incline Barbell Bench Press | horizontal_push | chest | barbell | front_delts,triceps | c | incline bench,incline barbell press
Decline Barbell Bench Press | horizontal_push | chest | barbell | triceps | c | decline bench
Close-Grip Bench Press | horizontal_push | triceps | barbell | chest,front_delts | c | cgbp,close grip bench
Board Press | horizontal_push | triceps | barbell | chest | c | 2-board press,3-board press
Floor Press | horizontal_push | triceps | barbell | chest,front_delts | c |
Spoto Press | horizontal_push | chest | barbell | triceps | c |
Pause Bench Press | horizontal_push | chest | barbell | triceps,front_delts | c | paused bench
Larsen Press | horizontal_push | chest | barbell | triceps | c |
Dumbbell Bench Press | horizontal_push | chest | dumbbell | triceps,front_delts | c | db bench,flat dumbbell press
Incline Dumbbell Press | horizontal_push | chest | dumbbell | front_delts,triceps | c | incline db press
Decline Dumbbell Press | horizontal_push | chest | dumbbell | triceps | c |
Dumbbell Floor Press | horizontal_push | triceps | dumbbell | chest | c |
Neutral-Grip Dumbbell Press | horizontal_push | chest | dumbbell | triceps | c | hammer grip db press
Smith Machine Bench Press | horizontal_push | chest | smith | triceps,front_delts | c |
Smith Machine Incline Press | horizontal_push | chest | smith | front_delts,triceps | c |
Machine Chest Press | horizontal_push | chest | machine | triceps,front_delts | c | seated chest press
Incline Machine Press | horizontal_push | chest | machine | front_delts,triceps | c | hammer strength incline
Hammer Strength Chest Press | horizontal_push | chest | machine | triceps | c | plate-loaded chest press
Push-Up | horizontal_push | chest | bodyweight | triceps,front_delts | c | pushup,press-up
Weighted Push-Up | horizontal_push | chest | bodyweight | triceps | c |
Deficit Push-Up | horizontal_push | chest | bodyweight | triceps | c |
Diamond Push-Up | horizontal_push | triceps | bodyweight | chest | c | close-grip push-up
Chest Dip | horizontal_push | chest | bodyweight | triceps,front_delts | c | dips,parallel bar dip
Weighted Chest Dip | horizontal_push | chest | bodyweight | triceps | c |
Ring Dip | horizontal_push | chest | bodyweight | triceps | c |
Cable Fly | isolation | chest | cable | front_delts | | cable crossover
Low-to-High Cable Fly | isolation | chest | cable | front_delts | | incline cable fly
High-to-Low Cable Fly | isolation | chest | cable | | | decline cable fly
Dumbbell Fly | isolation | chest | dumbbell | front_delts | | flat fly,db fly
Incline Dumbbell Fly | isolation | chest | dumbbell | front_delts | |
Pec Deck | isolation | chest | machine | | | machine fly,butterfly
Svend Press | isolation | chest | other | | | plate press

# ---------- vertical push ----------
Overhead Press | vertical_push | front_delts | barbell | triceps,upper_back | c | ohp,military press,standing press
Seated Barbell Overhead Press | vertical_push | front_delts | barbell | triceps | c | seated military press
Push Press | vertical_push | front_delts | barbell | triceps,quads | c |
Behind-the-Neck Press | vertical_push | side_delts | barbell | triceps | c | btn press
Bradford Press | vertical_push | front_delts | barbell | side_delts,triceps | c |
Z Press | vertical_push | front_delts | barbell | abs,triceps | c |
Seated Dumbbell Shoulder Press | vertical_push | front_delts | dumbbell | triceps | c | seated db press
Standing Dumbbell Shoulder Press | vertical_push | front_delts | dumbbell | triceps,abs | c |
Arnold Press | vertical_push | front_delts | dumbbell | side_delts,triceps | c |
Single-Arm Dumbbell Press | vertical_push | front_delts | dumbbell | obliques,triceps | c,u |
Machine Shoulder Press | vertical_push | front_delts | machine | triceps | c |
Smith Machine Overhead Press | vertical_push | front_delts | smith | triceps | c |
Landmine Press | vertical_push | front_delts | barbell | chest,triceps | c,u |
Viking Press | vertical_push | front_delts | machine | triceps | c |
Pike Push-Up | vertical_push | front_delts | bodyweight | triceps | c |
Handstand Push-Up | vertical_push | front_delts | bodyweight | triceps | c | hspu

# ---------- delt isolation ----------
Dumbbell Lateral Raise | isolation | side_delts | dumbbell | traps | | side raise,lateral raise
Cable Lateral Raise | isolation | side_delts | cable | | |
Machine Lateral Raise | isolation | side_delts | machine | | |
Leaning Cable Lateral Raise | isolation | side_delts | cable | | u |
Lu Raise | isolation | side_delts | dumbbell | traps | |
Front Raise | isolation | front_delts | dumbbell | | | db front raise
Plate Front Raise | isolation | front_delts | other | | |
Cable Front Raise | isolation | front_delts | cable | | |
Dumbbell Rear Delt Fly | isolation | rear_delts | dumbbell | upper_back | | bent-over lateral raise,reverse fly
Reverse Pec Deck | isolation | rear_delts | machine | upper_back | | rear delt machine
Cable Rear Delt Fly | isolation | rear_delts | cable | upper_back | | reverse cable fly
Face Pull | isolation | rear_delts | cable | upper_back,traps | |
Band Pull-Apart | isolation | rear_delts | band | upper_back | |
Upright Row | vertical_pull | side_delts | barbell | traps,biceps | c |
Cable Upright Row | vertical_pull | side_delts | cable | traps | c |

# ---------- triceps ----------
Triceps Pushdown | isolation | triceps | cable | | | cable pushdown,pressdown
Rope Pushdown | isolation | triceps | cable | | | rope triceps extension
Overhead Cable Triceps Extension | isolation | triceps | cable | | | overhead rope extension
EZ-Bar Skull Crusher | isolation | triceps | barbell | | | lying triceps extension,skullcrusher
Dumbbell Skull Crusher | isolation | triceps | dumbbell | | |
JM Press | horizontal_push | triceps | barbell | chest | c |
California Press | horizontal_push | triceps | barbell | chest | c |
Tate Press | isolation | triceps | dumbbell | | |
Dumbbell Overhead Triceps Extension | isolation | triceps | dumbbell | | | seated db extension
Triceps Kickback | isolation | triceps | dumbbell | | u |
Bench Dip | isolation | triceps | bodyweight | front_delts | |

# ---------- vertical pull ----------
Pull-Up | vertical_pull | lats | bodyweight | biceps,upper_back | c | pullup
Weighted Pull-Up | vertical_pull | lats | bodyweight | biceps | c |
Chin-Up | vertical_pull | lats | bodyweight | biceps | c | chinup,supinated pull-up
Neutral-Grip Pull-Up | vertical_pull | lats | bodyweight | biceps | c | hammer grip pull-up
Lat Pulldown | vertical_pull | lats | cable | biceps,upper_back | c | pulldown
Wide-Grip Lat Pulldown | vertical_pull | lats | cable | upper_back | c |
Close-Grip Lat Pulldown | vertical_pull | lats | cable | biceps | c | v-bar pulldown
Reverse-Grip Lat Pulldown | vertical_pull | lats | cable | biceps | c | underhand pulldown
Single-Arm Lat Pulldown | vertical_pull | lats | cable | biceps | c,u |
Kneeling Cable Pulldown | vertical_pull | lats | cable | biceps | c |
Machine Pulldown | vertical_pull | lats | machine | biceps | c | hammer strength pulldown
Straight-Arm Pulldown | isolation | lats | cable | | | stiff-arm pulldown
Dumbbell Pullover | isolation | lats | dumbbell | chest | |
Machine Pullover | isolation | lats | machine | chest | | nautilus pullover

# ---------- horizontal pull ----------
Barbell Row | horizontal_pull | upper_back | barbell | lats,biceps | c | bent-over row,bor
Pendlay Row | horizontal_pull | upper_back | barbell | lats | c |
Yates Row | horizontal_pull | lats | barbell | upper_back | c | underhand barbell row
Dumbbell Row | horizontal_pull | lats | dumbbell | upper_back,biceps | c,u | one-arm row,db row
Kroc Row | horizontal_pull | lats | dumbbell | upper_back | c,u |
Chest-Supported Row | horizontal_pull | upper_back | dumbbell | lats | c | incline bench row
Seal Row | horizontal_pull | upper_back | barbell | lats | c |
T-Bar Row | horizontal_pull | upper_back | barbell | lats | c |
Meadows Row | horizontal_pull | lats | barbell | upper_back | c,u | landmine one-arm row
Landmine Row | horizontal_pull | upper_back | barbell | lats | c |
Seated Cable Row | horizontal_pull | upper_back | cable | lats,biceps | c | cable row
Wide-Grip Seated Row | horizontal_pull | upper_back | cable | rear_delts | c |
Single-Arm Cable Row | horizontal_pull | lats | cable | upper_back | c,u |
Machine Row | horizontal_pull | upper_back | machine | lats | c | hammer strength row
Inverted Row | horizontal_pull | upper_back | bodyweight | lats,biceps | c | bodyweight row
Smith Machine Row | horizontal_pull | upper_back | smith | lats | c |
Barbell Shrug | isolation | traps | barbell | forearms | |
Dumbbell Shrug | isolation | traps | dumbbell | forearms | |
Trap Bar Shrug | isolation | traps | barbell | forearms | |
Cable Shrug | isolation | traps | cable | | |

# ---------- biceps & forearms ----------
Barbell Curl | isolation | biceps | barbell | forearms | | bb curl
EZ-Bar Curl | isolation | biceps | barbell | forearms | |
Dumbbell Curl | isolation | biceps | dumbbell | forearms | | db curl,alternating curl
Incline Dumbbell Curl | isolation | biceps | dumbbell | | |
Hammer Curl | isolation | biceps | dumbbell | forearms | |
Cross-Body Hammer Curl | isolation | biceps | dumbbell | forearms | u |
Preacher Curl | isolation | biceps | barbell | | |
Machine Preacher Curl | isolation | biceps | machine | | |
Spider Curl | isolation | biceps | dumbbell | | |
Cable Curl | isolation | biceps | cable | forearms | |
Bayesian Cable Curl | isolation | biceps | cable | | u |
Concentration Curl | isolation | biceps | dumbbell | | u |
Reverse Curl | isolation | forearms | barbell | biceps | |
Drag Curl | isolation | biceps | barbell | | |
Wrist Curl | isolation | forearms | barbell | | |
Reverse Wrist Curl | isolation | forearms | dumbbell | | |
Wrist Roller | isolation | forearms | other | | |
Plate Pinch | carry | forearms | other | | |

# ---------- squat ----------
Back Squat | squat | quads | barbell | glutes,hamstrings | c | squat,barbell squat
High-Bar Back Squat | squat | quads | barbell | glutes | c |
Low-Bar Back Squat | squat | quads | barbell | glutes,hamstrings | c |
Front Squat | squat | quads | barbell | glutes,abs | c |
Safety Bar Squat | squat | quads | barbell | glutes,upper_back | c | ssb squat
Box Squat | squat | quads | barbell | glutes | c |
Pause Squat | squat | quads | barbell | glutes | c | paused squat
Tempo Squat | squat | quads | barbell | glutes | c |
Zercher Squat | squat | quads | barbell | glutes,abs | c |
Goblet Squat | squat | quads | dumbbell | glutes | c |
Hack Squat | squat | quads | machine | glutes | c | machine hack squat
Pendulum Squat | squat | quads | machine | glutes | c |
V-Squat | squat | quads | machine | glutes | c |
Smith Machine Squat | squat | quads | smith | glutes | c |
Leg Press | squat | quads | machine | glutes,hamstrings | c | 45-degree leg press
Single-Leg Press | squat | quads | machine | glutes | c,u |
Belt Squat | squat | quads | machine | glutes | c |
Sissy Squat | squat | quads | bodyweight | | |
Wall Sit | squat | quads | bodyweight | | |

# ---------- lunge / unilateral ----------
Walking Lunge | lunge | quads | dumbbell | glutes,hamstrings | c,u |
Reverse Lunge | lunge | glutes | dumbbell | quads | c,u |
Forward Lunge | lunge | quads | dumbbell | glutes | c,u |
Deficit Reverse Lunge | lunge | glutes | dumbbell | quads | c,u |
Bulgarian Split Squat | lunge | quads | dumbbell | glutes | c,u | rear-foot elevated split squat,rfess
Split Squat | lunge | quads | dumbbell | glutes | c,u |
Barbell Split Squat | lunge | quads | barbell | glutes | c,u |
Step-Up | lunge | glutes | dumbbell | quads | c,u |
Lateral Lunge | lunge | adductors | dumbbell | quads,glutes | c,u |
Curtsy Lunge | lunge | glutes | dumbbell | quads | c,u |
Pistol Squat | lunge | quads | bodyweight | glutes | c,u |

# ---------- hinge ----------
Conventional Deadlift | hinge | hamstrings | barbell | glutes,lower_back | c | deadlift,dl
Sumo Deadlift | hinge | glutes | barbell | quads,hamstrings | c |
Trap Bar Deadlift | hinge | quads | barbell | glutes,hamstrings | c | hex bar deadlift
Romanian Deadlift | hinge | hamstrings | barbell | glutes,lower_back | c | rdl
Dumbbell Romanian Deadlift | hinge | hamstrings | dumbbell | glutes | c |
Stiff-Leg Deadlift | hinge | hamstrings | barbell | lower_back | c | sldl
Deficit Deadlift | hinge | hamstrings | barbell | glutes,lower_back | c |
Rack Pull | hinge | upper_back | barbell | traps,glutes | c |
Block Pull | hinge | hamstrings | barbell | glutes | c |
Snatch-Grip Deadlift | hinge | upper_back | barbell | hamstrings,traps | c |
Single-Leg Romanian Deadlift | hinge | hamstrings | dumbbell | glutes | c,u | single-leg rdl
Good Morning | hinge | hamstrings | barbell | lower_back,glutes | c |
Hip Thrust | hinge | glutes | barbell | hamstrings | c | barbell hip thrust
Machine Hip Thrust | hinge | glutes | machine | hamstrings | c |
Glute Bridge | hinge | glutes | barbell | hamstrings | c |
Back Extension | hinge | lower_back | bodyweight | glutes,hamstrings | | hyperextension
45-Degree Back Extension | hinge | glutes | bodyweight | hamstrings,lower_back | |
Reverse Hyperextension | hinge | glutes | machine | lower_back | | reverse hyper
Kettlebell Swing | hinge | glutes | kettlebell | hamstrings | c,x |
Cable Pull-Through | hinge | glutes | cable | hamstrings | |
Nordic Ham Curl | hinge | hamstrings | bodyweight | glutes | c |
Glute Ham Raise | hinge | hamstrings | bodyweight | glutes,lower_back | c | ghr

# ---------- leg isolation ----------
Lying Leg Curl | isolation | hamstrings | machine | calves | |
Seated Leg Curl | isolation | hamstrings | machine | | |
Standing Leg Curl | isolation | hamstrings | machine | | u |
Leg Extension | isolation | quads | machine | | |
Single-Leg Extension | isolation | quads | machine | | u |
Standing Calf Raise | isolation | calves | machine | | | calf raise
Seated Calf Raise | isolation | calves | machine | | |
Leg Press Calf Raise | isolation | calves | machine | | |
Donkey Calf Raise | isolation | calves | machine | | |
Smith Machine Calf Raise | isolation | calves | smith | | |
Cable Glute Kickback | isolation | glutes | cable | hamstrings | u |
Hip Abduction Machine | isolation | abductors | machine | glutes | |
Hip Adduction Machine | isolation | adductors | machine | | |
Banded Lateral Walk | isolation | abductors | band | glutes | | monster walk
Frog Pump | isolation | glutes | bodyweight | | |

# ---------- core ----------
Plank | core | abs | bodyweight | obliques | |
Side Plank | core | obliques | bodyweight | abs | u |
Ab Wheel Rollout | core | abs | other | lats | |
Hanging Leg Raise | core | abs | bodyweight | obliques | |
Hanging Knee Raise | core | abs | bodyweight | | |
Toes-to-Bar | core | abs | bodyweight | lats | |
Cable Crunch | core | abs | cable | | | kneeling cable crunch
Machine Crunch | core | abs | machine | | |
Crunch | core | abs | bodyweight | | |
Sit-Up | core | abs | bodyweight | | |
Decline Sit-Up | core | abs | bodyweight | | |
Russian Twist | core | obliques | other | abs | |
Pallof Press | core | obliques | cable | abs | u |
Cable Woodchopper | core | obliques | cable | abs | u |
Landmine Twist | core | obliques | barbell | abs | |
Dead Bug | core | abs | bodyweight | | |
L-Sit | core | abs | bodyweight | | |
Dragon Flag | core | abs | bodyweight | lower_back | |

# ---------- carries ----------
Farmer's Walk | carry | forearms | dumbbell | traps,abs | c | farmers carry
Suitcase Carry | carry | obliques | dumbbell | forearms | c,u |
Overhead Carry | carry | front_delts | dumbbell | abs | c |
Yoke Walk | carry | full_body | other | upper_back,quads | c |
Sandbag Carry | carry | full_body | other | abs | c |

# ---------- explosive / olympic ----------
Power Clean | hinge | full_body | barbell | traps,quads | c,x |
Hang Clean | hinge | full_body | barbell | traps | c,x |
Clean and Jerk | hinge | full_body | barbell | front_delts,quads | c,x |
Snatch | hinge | full_body | barbell | traps,side_delts | c,x |
Power Snatch | hinge | full_body | barbell | traps | c,x |
Hang Snatch | hinge | full_body | barbell | traps | c,x |
Clean Pull | hinge | traps | barbell | hamstrings | c,x |
Snatch Pull | hinge | traps | barbell | hamstrings | c,x |
Barbell High Pull | hinge | traps | barbell | side_delts | c,x |
Push Jerk | vertical_push | front_delts | barbell | triceps,quads | c,x |
Split Jerk | vertical_push | front_delts | barbell | quads | c,x |
Jump Squat | squat | quads | bodyweight | calves | c,x |
Box Jump | squat | quads | bodyweight | calves | c,x |
Broad Jump | hinge | glutes | bodyweight | quads | c,x |
Medicine Ball Slam | core | abs | other | lats | c,x |

# ---------- neck ----------
Neck Curl | isolation | neck | other | | |
Neck Extension | isolation | neck | other | | |
Neck Harness Extension | isolation | neck | other | | |
`;
