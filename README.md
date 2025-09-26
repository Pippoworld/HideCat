# HideCat 🐱

A fun browser-based escape game where you control a cat trying to reach the exit while avoiding wild dogs.

## Game Features

### 🎮 Gameplay
- **Large Map**: Explore a 3000x3000 pixel world
- **Click to Move**: Click anywhere on the screen to move the cat
- **Keyboard Controls**: Use WASD or arrow keys for movement
- **Sprint**: Hold Shift to run faster (consumes stamina)

### 💡 Safe Zones
- Stand under street lights to be safe from wild dogs
- 12 randomly placed safe light zones throughout the map
- Dogs will stop chasing when you enter a light zone

### 🐕 Wild Dogs AI
- **15 wild dogs** patrol the map
- Each dog has its own territory
- **Three AI states**:
  - Patrol: Slow wandering within territory
  - Chase: Gradually accelerates when detecting the cat
  - Return: Goes back to territory when cat escapes
- **Speed curve**: Dogs start slow and gradually speed up during chase

### 🎯 Objective
- Find the green glowing exit to escape
- Avoid being caught by wild dogs
- Use safe zones strategically to plan your route

### 📊 UI Features
- Health bar display
- Distance to exit indicator
- Safety status indicator
- Minimap for navigation
- Danger warnings when dogs approach

## How to Play

1. Open `index.html` in a web browser
2. Click on the screen to move the cat
3. Use keyboard for alternative control
4. Avoid wild dogs by using light safe zones
5. Find and reach the exit to win

## Game Files

- `index.html` - Main game page
- `game.js` - Simple cat movement game
- `escape-game.html` - Main escape game page
- `escape-game.js` - Escape game logic with dogs and safe zones
- `cat-sprite.png` - Cat sprite animation sheet

## Controls

- **Mouse**: Click to set destination
- **WASD/Arrow Keys**: Direct movement
- **Shift**: Sprint (faster movement, uses stamina)

## Strategy Tips

- 🗺️ Check the minimap to plan your route
- 💡 Move from one safe zone to another
- 🏃 Save stamina for emergency escapes
- 👀 Watch dog patrol patterns
- ⏱️ Dogs accelerate slowly, giving you time to react

## Technical Details

- Built with HTML5 Canvas
- Pure JavaScript (no frameworks required)
- Sprite-based animation system
- Viewport scrolling for large map
- Optimized collision detection

Enjoy playing HideCat! 🎮🐱