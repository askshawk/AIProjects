# SimRefinery - Oil Refinery Management Simulation

A sophisticated web-based oil refinery management simulation game, built with Opus 4.8 to replicate the famous lost Maxis game **SimRefinery** (originally created for Chevron).

## Overview

SimRefinery is an interactive simulation where you manage the operations of a modern oil refinery. Balance production targets, safety protocols, environmental compliance, and financial performance while dealing with unexpected disasters and operational challenges.

## Features

### 🏭 Core Simulation
- **Crude Oil Processing**: Manage crude oil input and track through the refinery process
- **Multi-Stage Refining**: Realistic distillation and cracking processes with efficiency calculations
- **Storage Management**: Monitor and balance crude oil and product storage levels
- **System Health Monitoring**: Real-time tracking of refinery system integrity

### 🎮 Game Mechanics
- **Operations Control**: Adjust crude oil input, refining speed, and resource allocation
- **Safety Management**: Maintain safety levels to prevent violations and system damage
- **Environmental Compliance**: Meet environmental standards to reduce emissions and regulatory penalties
- **Financial Management**: Track daily revenue, operating costs, and overall budget

### ⚠️ Disaster System
- **Random Events**: Unpredictable equipment failures, chemical leaks, and system emergencies
- **Triggered Disasters**: Manually trigger disaster scenarios for testing and learning
- **Dynamic Response**: System health and efficiency are affected by disaster severity
- **Emergency Recovery**: Manage disaster intensity and return systems to normal operations

### 📚 Learning Mode
- **Educational Tips**: Toggle learning mode to see helpful tips about game mechanics
- **Interactive Guidance**: Contextual information about each control and its impact
- **Tutorial Information**: Learn refinery operations while playing

### 💡 Real-Time Dashboard
- **Live Metrics**: Production rates, storage levels, and system health
- **Financial Dashboard**: Revenue, costs, and budget tracking
- **Process Visualization**: See crude input flowing through distillation and cracking stages
- **Event Log**: Complete history of all game events and alerts

## Game Mechanics

### Operations Controls
1. **Crude Oil Input**: 0-500 barrels/day - Controls raw material flow
2. **Refining Speed**: 0.5x-2.0x - Affects production rate and efficiency
3. **Safety Level**: 0-100% - Higher values prevent violations but cost more
4. **Environmental Compliance**: 0-100% - Reduces emissions and regulatory penalties

### Resource Management
- **Crude Storage**: Limited capacity for raw crude oil
- **Product Storage**: Limited capacity for refined products
- **Budget**: Daily profit/loss affects long-term viability

### Financial Model
- **Revenue**: $85 per barrel of refined product
- **Base Costs**: $5,000 per day
- **Safety Costs**: Higher safety levels cost more to maintain
- **Environmental Costs**: Compliance requirements increase operational costs
- **Failure Condition**: Game ends if budget reaches zero

### Efficiency Factors
- Safety maintenance improves overall efficiency
- Faster refining speeds reduce efficiency
- Environmental compliance has minor efficiency impact
- System health affects production capacity

## How to Play

### Starting the Game
1. Open `index.html` in a web browser
2. Review the initial refinery status
3. Adjust controls to manage operations

### Basic Strategy
1. **Maintain Balance**: Don't focus solely on production - safety and compliance matter
2. **Monitor Budget**: Keep watching your budget to avoid bankruptcy
3. **Prevent Disasters**: Higher safety levels reduce disaster risk
4. **Manage Storage**: Avoid overfilling storage tanks
5. **Plan Ahead**: Consider long-term sustainability, not just short-term profits

### Game Actions
- **Advance Day**: Manually progress one simulation day forward
- **Pause**: Pause the auto-advancing simulation
- **Emergency Scenario**: Trigger a random disaster to test crisis management
- **Reset Game**: Start over with initial conditions

### Learning Tips
Enable "Learning Mode" from the header to see contextual tips about game mechanics and best practices.

## Technical Architecture

### Frontend
- **HTML5**: Semantic markup for dashboard and controls
- **CSS3**: Modern responsive grid layout with animations
- **Vanilla JavaScript**: Game engine with no external dependencies

### Game Engine
- **State Management**: Centralized game state object
- **Simulation Loop**: Realistic physics-based calculations
- **Event System**: Comprehensive event logging and alerts
- **Responsive Updates**: Real-time UI updates synchronized with game state

### Performance
- Lightweight implementation suitable for all devices
- No external dependencies - pure HTML/CSS/JS
- Optimized update intervals for smooth gameplay
- Efficient event log management

## Installation & Setup

### Local Development
```bash
# Navigate to project directory
cd simrefinery

# Start a simple HTTP server
python3 -m http.server 8000

# Open browser to http://localhost:8000
```

### Deployment
Can be deployed as static files to any web server:
- Netlify, Vercel, GitHub Pages, etc.
- No backend server required
- No build process needed

## Game Strategy Tips

### Profitable Operations
- Maintain safety at 60-80% for good balance
- Keep environmental compliance above 50%
- Aim for 200-300 barrel input rate initially
- Monitor storage to avoid waste

### Disaster Prevention
- Safety violations spike when safety < 30%
- Emergency scenarios damage system health significantly
- Build budget reserves for emergencies ($20,000+ minimum)
- Recovery takes multiple days

### Long-Term Success
- Day 5: First weekly review milestone
- Day 30: Should have $150,000+ budget
- Day 60: Proven sustainable operations
- Day 100: Master refinery operator status

## Comparison to Original SimRefinery

This version captures the essence of the original Maxis SimRefinery:
- **Management Focus**: Balancing multiple operational factors
- **Educational Value**: Learning how refineries actually work
- **Real-Time Simulation**: Dynamic responses to decisions
- **Decision-Making**: Complex systems with cascading effects

Built with Opus 4.8 to demonstrate the capability of modern AI in creating complex, interactive simulations from specifications.

## Future Enhancements

Potential features for future versions:
- Market dynamics affecting crude oil and product prices
- Multiple refinery units with different capabilities
- Research and development for efficiency improvements
- Employee morale and management
- Regulatory agency interactions
- Multiplayer competition modes
- Persistent saves and progression
- Achievement system

## Credits

**Original Game**: SimRefinery by Maxis (1989) - Made for Chevron
**Recreation**: Built with Claude Opus 4.8
**Inspired by**: Ethan Mollick's demonstration of AI game development

## License

MIT License - Feel free to use, modify, and distribute.

---

Enjoy running your refinery! 🏭⚙️
