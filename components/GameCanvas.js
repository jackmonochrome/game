import { useEffect, useRef, useState } from 'react';
import { ARCHETYPES, PLAYER_COLORS } from '../data/archetypes';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 600;
const WALL_PADDING = 40;
const RIVER_Y = 110;
const FINISH_ZONE_Y = 170;
const START_Y = CANVAS_HEIGHT - 120;
const DELTA_FIXED = 1 / 60;
const V_MIN = 0.1;
const T_HOLD = 1;
const DAMAGE_THRESHOLD = 30;
const TREE_DAMAGE_THRESHOLD = 45;
const TREES = [
  { x: 220, y: 320, radius: 28 },
  { x: 480, y: 250, radius: 32 },
  { x: 720, y: 360, radius: 26 },
];

const TEAM_ORDER = ['A', 'B'];

const MODES = {
  Classic: {
    name: 'Classic',
    damageMultiplier: 1,
  },
  Zen: {
    name: 'Zen',
    damageMultiplier: 0,
  },
  'Hard Crash': {
    name: 'Hard Crash',
    damageMultiplier: 1.4,
  },
};

function createCar(team, archetype, index) {
  const spec = ARCHETYPES[archetype];
  const baseX = team === 'A' ? WALL_PADDING + 90 : CANVAS_WIDTH - WALL_PADDING - 90;
  const laneOffset = (index - 2) * 34;
  return {
    id: `${team}-${archetype}-${index}`,
    team,
    archetype,
    color: spec.color,
    radius: spec.radius,
    mass: spec.mass,
    friction: spec.friction,
    bounce: spec.bounce,
    maxHp: 2,
    hp: 2,
    state: 'ready',
    position: { x: baseX + laneOffset, y: START_Y },
    velocity: { x: 0, y: 0 },
    restTimer: 0,
    burning: false,
    destroyed: false,
    drowned: false,
    scored: false,
    used: false,
    softScore: 0,
    finishBonus: false,
    pinned: false,
  };
}

function createInitialCars() {
  const archetypes = Object.keys(ARCHETYPES);
  const cars = [];
  TEAM_ORDER.forEach((team) => {
    archetypes.forEach((arch, index) => {
      cars.push(createCar(team, arch, index));
    });
  });
  return cars;
}

function vecLength(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveCircleCollision(carA, carB, mode) {
  const dx = carB.position.x - carA.position.x;
  const dy = carB.position.y - carA.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = carA.radius + carB.radius;
  if (dist === 0 || dist >= minDist) return { cars: [carA, carB], impulse: 0 };

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  const totalMass = carA.mass + carB.mass;
  const correction = overlap / totalMass;
  carA.position.x -= correction * carB.mass * nx;
  carA.position.y -= correction * carB.mass * ny;
  carB.position.x += correction * carA.mass * nx;
  carB.position.y += correction * carA.mass * ny;

  const relVelX = carB.velocity.x - carA.velocity.x;
  const relVelY = carB.velocity.y - carA.velocity.y;
  const relVelAlongNormal = relVelX * nx + relVelY * ny;
  if (relVelAlongNormal > 0) return { cars: [carA, carB], impulse: 0 };

  const restitution = Math.min(carA.bounce, carB.bounce);
  const impulseMag = -(1 + restitution) * relVelAlongNormal / (1 / carA.mass + 1 / carB.mass);
  const impulseX = impulseMag * nx;
  const impulseY = impulseMag * ny;

  carA.velocity.x -= impulseX / carA.mass;
  carA.velocity.y -= impulseY / carA.mass;
  carB.velocity.x += impulseX / carB.mass;
  carB.velocity.y += impulseY / carB.mass;

  const impactEnergy = Math.abs(impulseMag);
  const threshold = DAMAGE_THRESHOLD * mode.damageMultiplier;
  return { cars: [carA, carB], impulse: impactEnergy >= threshold ? impactEnergy : 0 };
}

function resolveCircleStatic(car, obstacle, bounce = 0.4) {
  const dx = car.position.x - obstacle.x;
  const dy = car.position.y - obstacle.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = car.radius + obstacle.radius;
  if (dist === 0 || dist >= minDist) return 0;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  car.position.x += nx * overlap;
  car.position.y += ny * overlap;
  const relVel = car.velocity.x * nx + car.velocity.y * ny;
  if (relVel > 0) return 0;
  const impulse = -(1 + bounce) * relVel * car.mass;
  car.velocity.x += (impulse * nx) / car.mass;
  car.velocity.y += (impulse * ny) / car.mass;
  return Math.abs(impulse);
}

function applyDamage(car, impulse, threshold) {
  if (impulse < threshold || car.destroyed || car.drowned) return;
  if (!car.burning) {
    car.burning = true;
    car.hp = 1;
    car.state = 'burning';
  } else {
    car.burning = false;
    car.hp = 0;
    car.destroyed = true;
    car.state = 'destroyed';
    car.velocity.x = 0;
    car.velocity.y = 0;
  }
}

function describeState(car) {
  if (car.drowned) return 'Drowned';
  if (car.destroyed) return 'Destroyed';
  if (car.state === 'burning') return 'Burning';
  if (car.scored) return 'Scored';
  if (car.state === 'ready' && !car.used) return 'Ready';
  if (car.used && car.state === 'ready') return 'Passed';
  return 'Active';
}

function computeScore(car) {
  if (car.destroyed || car.drowned) return 0;
  const distance = START_Y - car.position.y;
  const maxDistance = START_Y - WALL_PADDING;
  const raw = clamp(Math.round((distance / maxDistance) * 200), 0, 200);
  let score = raw;
  if (car.burning) {
    score = Math.floor(score * 0.5);
  }
  if (car.finishBonus) {
    score += 20;
  }
  if (car.pinned) {
    score -= 10;
  }
  return Math.max(score, 0);
}

export default function GameCanvas() {
  const canvasRef = useRef(null);
  const [modeKey, setModeKey] = useState('Classic');
  const [cars, setCars] = useState(createInitialCars);
  const carsRef = useRef(cars);
  const [currentPlayer, setCurrentPlayer] = useState('A');
  const [turnIndex, setTurnIndex] = useState(0);
  const [selectedCarId, setSelectedCarId] = useState(null);
  const [aimVector, setAimVector] = useState(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [shotClock, setShotClock] = useState(25);
  const shotClockRef = useRef(25);
  const [clockActive, setClockActive] = useState(true);
  const clockActiveRef = useRef(true);
  const [roundEnded, setRoundEnded] = useState(false);
  const [scoreboard, setScoreboard] = useState({ A: 0, B: 0 });
  const [log, setLog] = useState([]);
  const animationRef = useRef(null);
  const pointerState = useRef({ active: false, start: null });

  useEffect(() => {
    carsRef.current = cars;
  }, [cars]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (roundEnded || !clockActiveRef.current) return;
      shotClockRef.current -= 1;
      if (shotClockRef.current <= 0) {
        handleShotTimeout();
      } else {
        setShotClock(shotClockRef.current);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [roundEnded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');

    let accumulator = 0;
    let lastTimestamp;

    const loop = (timestamp) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const deltaMs = timestamp - lastTimestamp;
      lastTimestamp = timestamp;
      accumulator += deltaMs / 1000;
      while (accumulator >= DELTA_FIXED) {
        stepPhysics(DELTA_FIXED);
        accumulator -= DELTA_FIXED;
      }
      render(context);
      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);
  }, [modeKey]);

  useEffect(() => {
    resetGame();
  }, [modeKey]);

  const currentMode = MODES[modeKey];

  function resetShotClock() {
    shotClockRef.current = 25;
    setShotClock(25);
  }

  function startShotClock() {
    clockActiveRef.current = true;
    setClockActive(true);
  }

  function stopShotClock() {
    clockActiveRef.current = false;
    setClockActive(false);
  }

  function resetGame() {
    const freshCars = createInitialCars();
    setCars(freshCars);
    setCurrentPlayer('A');
    setTurnIndex(0);
    setSelectedCarId(null);
    setAimVector(null);
    setIsLaunching(false);
    resetShotClock();
    startShotClock();
    setRoundEnded(false);
    setScoreboard({ A: 0, B: 0 });
    setLog([]);
  }

  function handleShotTimeout() {
    const team = currentPlayer;
    const available = getAvailableCars(team);
    if (available.length === 0) {
      logEvent(`${team} has no cars remaining.`);
      advanceTurn();
      return;
    }
    const car = available[0];
    car.used = true;
    car.state = 'ready';
    logEvent(`${team} timed out with ${car.archetype}.`);
    setCars([...carsRef.current]);
    advanceTurn();
  }

  function logEvent(message) {
    setLog((prev) => [message, ...prev].slice(0, 6));
  }

  function getAvailableCars(team) {
    return carsRef.current.filter((c) => c.team === team && !c.used);
  }

  function stepPhysics(dt) {
    const allCars = carsRef.current;
    let anyMoving = false;
    allCars.forEach((car) => {
      if (car.destroyed || car.drowned) return;
      if (car.velocity.x === 0 && car.velocity.y === 0) {
        if (car.restTimer > 0) car.restTimer = 0;
        return;
      }
      car.position.x += car.velocity.x * dt;
      car.position.y += car.velocity.y * dt;
      const speed = vecLength(car.velocity);
      const drag = car.friction;
      car.velocity.x *= Math.max(0, 1 - drag * 60 * dt);
      car.velocity.y *= Math.max(0, 1 - drag * 60 * dt);
      const newSpeed = vecLength(car.velocity);
      if (newSpeed < V_MIN) {
        car.restTimer += dt;
        if (car.restTimer >= T_HOLD) {
          car.velocity.x = 0;
          car.velocity.y = 0;
          car.restTimer = 0;
          car.scored = true;
        }
      } else {
        car.restTimer = 0;
      }
      anyMoving = anyMoving || newSpeed >= V_MIN;
    });

    // Walls
    allCars.forEach((car) => {
      if (car.destroyed || car.drowned) return;
      if (car.position.x - car.radius < WALL_PADDING) {
        car.position.x = WALL_PADDING + car.radius;
        car.velocity.x = Math.abs(car.velocity.x) * car.bounce;
      } else if (car.position.x + car.radius > CANVAS_WIDTH - WALL_PADDING) {
        car.position.x = CANVAS_WIDTH - WALL_PADDING - car.radius;
        car.velocity.x = -Math.abs(car.velocity.x) * car.bounce;
      }
      if (car.position.y + car.radius > CANVAS_HEIGHT - WALL_PADDING) {
        car.position.y = CANVAS_HEIGHT - WALL_PADDING - car.radius;
        car.velocity.y = -Math.abs(car.velocity.y) * car.bounce;
      }
      if (car.position.y - car.radius < RIVER_Y) {
        car.drowned = true;
        car.state = 'drowned';
        car.velocity.x = 0;
        car.velocity.y = 0;
        logEvent(`${car.team} ${car.archetype} drowned!`);
      }
    });

    // Trees
    allCars.forEach((car) => {
      if (car.destroyed || car.drowned) return;
      TREES.forEach((tree) => {
        const impulse = resolveCircleStatic(car, tree, 0.35);
        if (impulse > 0 && impulse >= TREE_DAMAGE_THRESHOLD * currentMode.damageMultiplier) {
          applyDamage(car, impulse, TREE_DAMAGE_THRESHOLD * currentMode.damageMultiplier);
          if (car.destroyed) {
            logEvent(`${car.team} ${car.archetype} destroyed hitting a tree!`);
          } else if (car.burning) {
            logEvent(`${car.team} ${car.archetype} is burning after hitting a tree!`);
          }
        }
      });
    });

    // Car collisions
    for (let i = 0; i < allCars.length; i += 1) {
      const carA = allCars[i];
      if (carA.destroyed || carA.drowned) continue;
      for (let j = i + 1; j < allCars.length; j += 1) {
        const carB = allCars[j];
        if (carB.destroyed || carB.drowned) continue;
        const { impulse } = resolveCircleCollision(carA, carB, currentMode);
        if (impulse > 0 && currentMode.damageMultiplier > 0) {
          applyDamage(carA, impulse, DAMAGE_THRESHOLD * currentMode.damageMultiplier);
          applyDamage(carB, impulse, DAMAGE_THRESHOLD * currentMode.damageMultiplier);
          if (carA.destroyed) logEvent(`${carA.team} ${carA.archetype} exploded!`);
          else if (carA.burning) logEvent(`${carA.team} ${carA.archetype} is burning!`);
          if (carB.destroyed) logEvent(`${carB.team} ${carB.archetype} exploded!`);
          else if (carB.burning) logEvent(`${carB.team} ${carB.archetype} is burning!`);
        }
      }
    }

    // Finish zone & pinned checks
    allCars.forEach((car) => {
      if (car.destroyed || car.drowned) return;
      if (car.position.y <= FINISH_ZONE_Y && car.scored) {
        car.finishBonus = true;
      }
      if (car.position.x - car.radius <= WALL_PADDING + 1 && car.position.y > RIVER_Y) {
        car.pinned = true;
      }
      if (car.position.x + car.radius >= CANVAS_WIDTH - WALL_PADDING - 1 && car.position.y > RIVER_Y) {
        car.pinned = true;
      }
    });

    const updated = [...allCars];
    carsRef.current = updated;
    setCars(updated);

    if (!anyMoving && !roundEnded) {
      const turnFinished = checkTurnCompletion();
      if (turnFinished) {
        advanceTurn();
      }
      const everyoneUsed = TEAM_ORDER.every((team) => getAvailableCars(team).length === 0);
      if (everyoneUsed && turnFinished) {
        finalizeScores();
      }
    }
  }

  function checkTurnCompletion() {
    return carsRef.current.every((car) => vecLength(car.velocity) < V_MIN);
  }

  function finalizeScores() {
    const byTeam = { A: 0, B: 0 };
    carsRef.current.forEach((car) => {
      const score = computeScore(car);
      car.softScore = score;
      byTeam[car.team] += score;
    });
    setScoreboard(byTeam);
    setRoundEnded(true);
    stopShotClock();
    logEvent(`Round end — Team A: ${byTeam.A} vs Team B: ${byTeam.B}`);
  }

  function advanceTurn() {
    resetShotClock();
    startShotClock();
    setAimVector(null);
    setSelectedCarId(null);
    setIsLaunching(false);
    setTurnIndex((prev) => prev + 1);
    setCurrentPlayer((prev) => (prev === 'A' ? 'B' : 'A'));
  }

  function handlePointerDown(event) {
    if (roundEnded) return;
    const car = carsRef.current.find((c) => c.id === selectedCarId);
    if (!car) return;
    pointerState.current = {
      active: true,
      start: getRelativePointer(event),
    };
    setIsLaunching(true);
  }

  function handlePointerMove(event) {
    if (!pointerState.current.active) return;
    const car = carsRef.current.find((c) => c.id === selectedCarId);
    if (!car) return;
    const current = getRelativePointer(event);
    const dx = pointerState.current.start.x - current.x;
    const dy = pointerState.current.start.y - current.y;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    const safeMagnitude = Math.max(magnitude, 0.0001);
    const capped = magnitude > 80 ? 80 + (magnitude - 80) * 0.3 : magnitude;
    const limited = Math.min(capped, 100);
    const aim = {
      dx,
      dy,
      power: limited,
      angle: Math.atan2(dy, dx),
      rawPower: safeMagnitude,
    };
    setAimVector(aim);
  }

  function handlePointerUp() {
    if (!pointerState.current.active) return;
    pointerState.current = { active: false, start: null };
    const aim = aimVector;
    if (!aim) {
      setIsLaunching(false);
      return;
    }
    launchSelectedCar(aim);
  }

  function getRelativePointer(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (CANVAS_WIDTH / rect.width),
      y: (event.clientY - rect.top) * (CANVAS_HEIGHT / rect.height),
    };
  }

  function launchSelectedCar(aim) {
    const car = carsRef.current.find((c) => c.id === selectedCarId);
    if (!car || car.used) return;
    const impulseScale = aim.power / 12;
    const speed = impulseScale / car.mass;
    const length = Math.sqrt(aim.dx * aim.dx + aim.dy * aim.dy);
    if (length < 4) {
      setIsLaunching(false);
      return;
    }
    const dirX = aim.dx / length;
    const dirY = aim.dy / length;
    car.velocity.x = dirX * speed;
    car.velocity.y = dirY * speed;
    car.state = 'active';
    car.used = true;
    logEvent(`${car.team} launched the ${car.archetype}!`);
    setCars([...carsRef.current]);
    setAimVector(null);
    setIsLaunching(false);
    resetShotClock();
  }

  function handleCarSelect(car) {
    if (roundEnded) return;
    if (car.team !== currentPlayer) return;
    if (car.used) return;
    setSelectedCarId(car.id);
    resetShotClock();
  }

  function handleModeChange(event) {
    setModeKey(event.target.value);
  }

  function render(context) {
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Background
    context.fillStyle = '#0b1723';
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // River
    context.fillStyle = '#1d4ed8';
    context.fillRect(0, 0, CANVAS_WIDTH, RIVER_Y);
    context.fillStyle = '#3b82f6';
    context.fillRect(0, 0, CANVAS_WIDTH, 6);

    // Road surface
    const gradient = context.createLinearGradient(0, RIVER_Y, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#374151');
    gradient.addColorStop(1, '#1f2937');
    context.fillStyle = gradient;
    context.fillRect(0, RIVER_Y, CANVAS_WIDTH, CANVAS_HEIGHT - RIVER_Y);

    // Finish zone
    context.fillStyle = 'rgba(34,197,94,0.25)';
    context.fillRect(WALL_PADDING, WALL_PADDING, CANVAS_WIDTH - WALL_PADDING * 2, FINISH_ZONE_Y - WALL_PADDING);

    // Walls
    context.fillStyle = '#111827';
    context.fillRect(0, RIVER_Y, WALL_PADDING, CANVAS_HEIGHT - RIVER_Y);
    context.fillRect(CANVAS_WIDTH - WALL_PADDING, RIVER_Y, WALL_PADDING, CANVAS_HEIGHT - RIVER_Y);

    // Trees
    TREES.forEach((tree) => {
      const treeGradient = context.createRadialGradient(
        tree.x - tree.radius * 0.3,
        tree.y - tree.radius * 0.4,
        tree.radius * 0.2,
        tree.x,
        tree.y,
        tree.radius
      );
      treeGradient.addColorStop(0, '#bef264');
      treeGradient.addColorStop(1, '#4d7c0f');
      context.fillStyle = treeGradient;
      context.beginPath();
      context.arc(tree.x, tree.y, tree.radius, 0, Math.PI * 2);
      context.fill();
    });

    // Cars
    carsRef.current.forEach((car) => {
      if (car.destroyed) return;
      context.save();
      context.beginPath();
      context.fillStyle = car.drowned ? '#0ea5e9' : car.color;
      context.globalAlpha = car.burning ? 0.7 : 1;
      context.arc(car.position.x, car.position.y, car.radius, 0, Math.PI * 2);
      context.fill();
      context.lineWidth = car.team === 'A' ? 3 : 3;
      context.strokeStyle = PLAYER_COLORS[car.team];
      context.stroke();
      context.fillStyle = '#0f172a';
      context.font = 'bold 12px "Segoe UI"';
      context.textAlign = 'center';
      context.fillText(car.archetype[0], car.position.x, car.position.y + 4);
      context.restore();

      if (car.burning) {
        const flameRadius = car.radius + 6 + Math.sin(Date.now() / 120) * 2;
        context.strokeStyle = 'rgba(251,191,36,0.8)';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(car.position.x, car.position.y, flameRadius, 0, Math.PI * 2);
        context.stroke();
      }

      // Distance ruler
      context.strokeStyle = 'rgba(148,163,184,0.4)';
      context.beginPath();
      context.moveTo(car.position.x, car.position.y);
      context.lineTo(car.position.x, CANVAS_HEIGHT - WALL_PADDING + 6);
      context.stroke();
    });

    // Aim vector preview
    if (isLaunching && aimVector) {
      const car = carsRef.current.find((c) => c.id === selectedCarId);
      if (car) {
        context.strokeStyle = '#fbbf24';
        context.setLineDash([8, 6]);
        context.beginPath();
        context.moveTo(car.position.x, car.position.y);
        const previewLength = aimVector.power * 2.5;
        context.lineTo(
          car.position.x + (aimVector.dx / aimVector.rawPower) * previewLength,
          car.position.y + (aimVector.dy / aimVector.rawPower) * previewLength
        );
        context.stroke();
        context.setLineDash([]);
      }
    }

    // HUD overlays
    drawHud(context);
  }

  function drawHud(context) {
    context.fillStyle = 'rgba(15,23,42,0.8)';
    context.fillRect(20, CANVAS_HEIGHT - 90, 260, 70);
    context.fillRect(CANVAS_WIDTH - 300, 20, 280, 120);

    context.fillStyle = '#f1f5f9';
    context.font = '16px "Segoe UI"';
    context.fillText(`Turn ${turnIndex + 1} • Team ${currentPlayer}`, 34, CANVAS_HEIGHT - 58);
    context.fillText(`Shot Clock: ${clockActive ? `${shotClock}s` : '—'}`, 34, CANVAS_HEIGHT - 34);

    context.fillText('Scoreboard', CANVAS_WIDTH - 280, 46);
    context.fillText(`Team A: ${scoreboard.A}`, CANVAS_WIDTH - 280, 72);
    context.fillText(`Team B: ${scoreboard.B}`, CANVAS_WIDTH - 280, 96);
    if (roundEnded) {
      const winner = scoreboard.A === scoreboard.B ? 'Draw' : scoreboard.A > scoreboard.B ? 'Team A' : 'Team B';
      context.fillStyle = '#facc15';
      context.fillText(`Winner: ${winner}`, CANVAS_WIDTH - 280, 120);
    }
  }

  return (
    <div className="game-shell">
      <div className="sidebar">
        <h1>Canyon Curlers</h1>
        <p>
          Launch archetype cars down the canyon. Alternate turns, avoid the river, and stack up points like
          pétanque on wheels.
        </p>
        <label className="mode-select">
          Mode
          <select value={modeKey} onChange={handleModeChange}>
            {Object.keys(MODES).map((mode) => (
              <option key={mode} value={mode}>
                {MODES[mode].name}
              </option>
            ))}
          </select>
        </label>
        <section>
          <h2>Team {currentPlayer} Garage</h2>
          <div className="car-grid">
            {getAvailableCars(currentPlayer).map((car) => (
              <button
                key={car.id}
                className={`car-button ${selectedCarId === car.id ? 'selected' : ''}`}
                onClick={() => handleCarSelect(car)}
              >
                <span className="car-title">{car.archetype}</span>
                <span className="car-sub">{ARCHETYPES[car.archetype].description}</span>
              </button>
            ))}
            {getAvailableCars(currentPlayer).length === 0 && <p>All cars spent.</p>}
          </div>
        </section>
        <section>
          <h2>Event Log</h2>
          <ul className="log-list">
            {log.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ul>
        </section>
        {roundEnded && (
          <section className="results">
            <h2>Round Breakdown</h2>
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Car</th>
                  <th>State</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {carsRef.current.map((car) => (
                  <tr key={car.id}>
                    <td>{car.team}</td>
                    <td>{car.archetype}</td>
                    <td>{describeState(car)}</td>
                    <td>{computeScore(car)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="results-actions">
              <button onClick={resetGame}>Play Again</button>
            </div>
          </section>
        )}
      </div>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
        />
      </div>
      <style jsx>{`
        .game-shell {
          display: flex;
          gap: 24px;
          padding: 32px;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background: radial-gradient(circle at top, rgba(15,23,42,0.85), rgba(15,23,42,1));
        }
        .sidebar {
          width: 360px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
          padding-right: 12px;
        }
        h1 {
          margin: 0;
          font-size: 28px;
        }
        h2 {
          margin: 16px 0 8px;
          font-size: 18px;
          color: #cbd5f5;
        }
        p {
          margin: 0;
          line-height: 1.5;
          color: #cbd5f5;
        }
        .mode-select {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 14px;
        }
        select {
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid rgba(148,163,184,0.3);
          background: rgba(15,23,42,0.8);
          color: #f1f5f9;
        }
        .car-grid {
          display: grid;
          gap: 8px;
        }
        .car-button {
          text-align: left;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(148,163,184,0.4);
          background: rgba(15,23,42,0.6);
          color: #f1f5f9;
          transition: border-color 0.2s ease, transform 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .car-button:hover {
          border-color: #38bdf8;
          transform: translateY(-2px);
        }
        .car-button.selected {
          border-color: #fbbf24;
          box-shadow: 0 0 0 2px rgba(251,191,36,0.35);
        }
        .car-title {
          font-weight: 600;
        }
        .car-sub {
          font-size: 12px;
          color: #94a3b8;
        }
        .log-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 4px;
          font-size: 13px;
          color: #cbd5f5;
        }
        .results table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .results th,
        .results td {
          border-bottom: 1px solid rgba(148,163,184,0.2);
          padding: 6px 4px;
          text-align: left;
        }
        .results-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 12px;
        }
        .results button {
          padding: 8px 16px;
          border-radius: 8px;
          border: none;
          background: linear-gradient(120deg, #38bdf8, #a855f7);
          color: #0f172a;
          font-weight: 600;
          cursor: pointer;
        }
        .canvas-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        canvas {
          border-radius: 18px;
          box-shadow: 0 20px 45px rgba(2,6,23,0.55);
          border: 1px solid rgba(148,163,184,0.2);
          max-width: 100%;
          height: auto;
          cursor: ${isLaunching ? 'grabbing' : 'crosshair'};
          background: #030712;
        }
        @media (max-width: 1280px) {
          .game-shell {
            flex-direction: column;
            align-items: center;
            padding: 16px;
          }
          .sidebar {
            width: 100%;
            max-width: 720px;
          }
        }
      `}</style>
    </div>
  );
}
