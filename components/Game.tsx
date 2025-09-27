"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const ARENA_WIDTH = 1200;
const ARENA_HEIGHT = 640;
const RIVER_HEIGHT = 110;
const START_X = 100;
const FINISH_X = ARENA_WIDTH - 120;
const HOUSE_ZONE_X = ARENA_WIDTH - 220;
const HOUSE_ZONE_RADIUS = 80;

const V_MIN = 0.1;
const T_HOLD = 1.0;
const FRAME_DT = 1 / 60;
const POWER_SOFT_CAP = 80;
const POWER_HARD_CAP = 100;
const POWER_SCALE = 0.45;
const DAMAGE_THRESHOLD_CLASSIC = 30;
const DAMAGE_THRESHOLD_HARD = 22;
const TREE_DAMAGE_THRESHOLD = 45;
const SHOT_CLOCK_SECONDS = 25;

const TREES = [
  { x: 360, y: 220, radius: 28 },
  { x: 620, y: 150, radius: 24 },
  { x: 760, y: 360, radius: 26 },
  { x: 980, y: 250, radius: 24 },
  { x: 520, y: 420, radius: 24 }
];

const ICE_PATCHES = [
  { x: 520, y: 520, radius: 90, friction: 0.03 },
  { x: 840, y: 460, radius: 120, friction: 0.05 }
];

enum CarState {
  Intact = "intact",
  Burning = "burning",
  Destroyed = "destroyed",
  Drowned = "drowned",
  Scored = "scored"
}

type TeamId = "A" | "B";

const TEAM_COLORS: Record<TeamId, string> = {
  A: "#38bdf8",
  B: "#f97316"
};

const ARCHETYPES = {
  Speed: {
    mass: 0.9,
    radius: 24,
    friction: 0.04,
    bounciness: 0.78,
    color: "#22d3ee"
  },
  Truck: {
    mass: 1.8,
    radius: 30,
    friction: 0.08,
    bounciness: 0.6,
    color: "#cbd5f5"
  },
  Buggy: {
    mass: 1.2,
    radius: 26,
    friction: 0.05,
    bounciness: 0.82,
    color: "#facc15"
  },
  Tank: {
    mass: 2.4,
    radius: 34,
    friction: 0.1,
    bounciness: 0.4,
    color: "#94a3b8"
  },
  Sports: {
    mass: 1.1,
    radius: 25,
    friction: 0.045,
    bounciness: 0.72,
    color: "#a855f7"
  }
} as const;

type ArchetypeName = keyof typeof ARCHETYPES;

interface Car {
  id: string;
  team: TeamId;
  archetype: ArchetypeName;
  position: Vector;
  velocity: Vector;
  restTimer: number;
  used: boolean;
  state: CarState;
  stage: 0 | 1 | 2;
  timedOut?: boolean;
  lastImpact?: number;
  isActive: boolean;
}

interface Vector {
  x: number;
  y: number;
}

interface Tree {
  x: number;
  y: number;
  radius: number;
}

interface AimState {
  origin: Vector;
  pointer: Vector;
  carId: string;
}

type GamePhase = "aim" | "resolving" | "summary";

type RuleMode = "Classic" | "Hard Crash" | "Zen";

type Variant = "Classic Canyon" | "Serpentine" | "River Bridge";

type ScoreBreakdown = {
  car: Car;
  base: number;
  modifiers: string[];
  total: number;
};
const TREES_BY_VARIANT: Record<Variant, Tree[]> = {
  "Classic Canyon": TREES,
  Serpentine: [
    { x: 340, y: 210, radius: 28 },
    { x: 520, y: 320, radius: 28 },
    { x: 700, y: 200, radius: 26 },
    { x: 880, y: 340, radius: 24 },
    { x: 1020, y: 160, radius: 22 }
  ],
  "River Bridge": [
    { x: 420, y: 170, radius: 26 },
    { x: 420, y: 310, radius: 28 },
    { x: 780, y: 220, radius: 30 },
    { x: 900, y: 420, radius: 26 }
  ]
};

const LOW_GRIP_PATCHES_BY_VARIANT: Record<Variant, typeof ICE_PATCHES> = {
  "Classic Canyon": ICE_PATCHES,
  Serpentine: [
    { x: 600, y: 520, radius: 80, friction: 0.045 },
    { x: 940, y: 480, radius: 100, friction: 0.055 }
  ],
  "River Bridge": [
    { x: 600, y: 500, radius: 90, friction: 0.04 },
    { x: 820, y: 120, radius: 120, friction: 0.035 }
  ]
};

const CARS_PER_TEAM = 5;
const TOTAL_TURNS = CARS_PER_TEAM * 2;

function createInitialCars(): Car[] {
  const lineup: ArchetypeName[] = ["Speed", "Truck", "Buggy", "Tank", "Sports"];
  const createTeamCars = (team: TeamId) =>
    lineup.map((archetype, index) => {
      const laneOffset = team === "A" ? 420 : 200;
      return {
        id: `${team}-${archetype}-${index}`,
        team,
        archetype,
        position: {
          x: START_X - 28,
          y: laneOffset + index * (team === "A" ? 36 : -36)
        },
        velocity: { x: 0, y: 0 },
        restTimer: Infinity,
        used: false,
        state: CarState.Intact,
        stage: 0,
        isActive: false
      } satisfies Car;
    });

  return [...createTeamCars("A"), ...createTeamCars("B")];
}

function magnitude(v: Vector): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function normalize(v: Vector): Vector {
  const mag = magnitude(v);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Vector, b: Vector) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function dot(a: Vector, b: Vector) {
  return a.x * b.x + a.y * b.y;
}

function subtract(a: Vector, b: Vector): Vector {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Vector, b: Vector): Vector {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v: Vector, factor: number): Vector {
  return { x: v.x * factor, y: v.y * factor };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function carRadius(car: Car) {
  return ARCHETYPES[car.archetype].radius;
}

function carFriction(car: Car, modifiers: number) {
  const base = ARCHETYPES[car.archetype].friction;
  return Math.max(0, base + modifiers);
}

function carMass(car: Car) {
  return ARCHETYPES[car.archetype].mass;
}

function carBounce(car: Car) {
  return ARCHETYPES[car.archetype].bounciness;
}

function getDamageThreshold(mode: RuleMode) {
  if (mode === "Zen") return Number.POSITIVE_INFINITY;
  if (mode === "Hard Crash") return DAMAGE_THRESHOLD_HARD;
  return DAMAGE_THRESHOLD_CLASSIC;
}

function applySoftHardCap(raw: number) {
  const softened = POWER_HARD_CAP * (1 - Math.exp(-raw / POWER_SOFT_CAP));
  return Math.min(softened, POWER_HARD_CAP);
}

function computePreview(car: Car, velocity: Vector, friction: number): Vector[] {
  const points: Vector[] = [];
  let position = { ...car.position };
  let vel = { ...velocity };
  const steps = 40;
  for (let i = 0; i < steps; i += 1) {
    vel.x *= 1 - friction * FRAME_DT;
    vel.y *= 1 - friction * FRAME_DT;
    position = add(position, scale(vel, FRAME_DT * 60));
    points.push({ ...position });
  }
  return points;
}

function detectPinned(car: Car, trees: Tree[]): boolean {
  const radius = carRadius(car);
  const nearWall = car.position.y - radius <= 0 || car.position.y + radius >= ARENA_HEIGHT;
  if (!nearWall) return false;
  return trees.some((tree) => distance(car.position, tree) < tree.radius + radius + 4);
}

function isInsideFinishZone(position: Vector) {
  return (
    position.x >= FINISH_X - 30 &&
    position.x <= FINISH_X + 30 &&
    position.y >= ARENA_HEIGHT / 2 - 80 &&
    position.y <= ARENA_HEIGHT / 2 + 80
  );
}

function isInsideHouseZone(position: Vector) {
  const center = { x: HOUSE_ZONE_X, y: ARENA_HEIGHT / 2 };
  return distance(position, center) <= HOUSE_ZONE_RADIUS;
}

function computeScore(
  car: Car,
  modifiers: { safeFinish: boolean; houseZone: boolean }
): ScoreBreakdown {
  const distanceRaw = clamp(car.position.x - START_X, 0, FINISH_X - START_X);
  let baseScore = Math.round((distanceRaw / (FINISH_X - START_X)) * 200);
  const messages: string[] = [];
  let total = baseScore;
  if (car.state === CarState.Destroyed || car.state === CarState.Drowned) {
    total = 0;
    baseScore = 0;
    messages.push(car.state === CarState.Drowned ? "Drowned (0)" : "Destroyed (0)");
  } else {
    if (car.stage === 1) {
      total = Math.floor(total * 0.5);
      messages.push("Burning ×0.5");
    }
    if (modifiers.safeFinish && isInsideFinishZone(car.position)) {
      total += 20;
      messages.push("Safe Finish +20");
    }
    if (modifiers.houseZone && isInsideHouseZone(car.position)) {
      total = Math.round(total * 1.25);
      messages.push("House ×1.25");
    }
    if (car.timedOut) {
      total = 0;
      messages.push("Shot clock timeout (0)");
    }
  }

  return {
    car,
    base: baseScore,
    modifiers: messages,
    total
  };
}
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cars, setCars] = useState<Car[]>(() => createInitialCars());
  const [turnIndex, setTurnIndex] = useState(0);
  const [phase, setPhase] = useState<GamePhase>("aim");
  const [aim, setAim] = useState<AimState | null>(null);
  const [preview, setPreview] = useState<Vector[]>([]);
  const [shotClock, setShotClock] = useState(SHOT_CLOCK_SECONDS);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [mode, setMode] = useState<RuleMode>("Classic");
  const [variant, setVariant] = useState<Variant>("Classic Canyon");
  const [safeFinish, setSafeFinish] = useState(true);
  const [houseZone, setHouseZone] = useState(false);
  const [crowdControl, setCrowdControl] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const shotClockRef = useRef<NodeJS.Timeout | null>(null);
  const carsRef = useRef<Car[]>(cars);

  const activeTeam: TeamId = useMemo(() => (turnIndex % 2 === 0 ? "A" : "B"), [turnIndex]);
  const trees = useMemo(() => TREES_BY_VARIANT[variant], [variant]);
  const lowGrip = useMemo(() => LOW_GRIP_PATCHES_BY_VARIANT[variant], [variant]);

  useEffect(() => {
    carsRef.current = cars;
  }, [cars]);

  const availableCars = useMemo(
    () => cars.filter((car) => car.team === activeTeam && !car.used),
    [cars, activeTeam]
  );

  useEffect(() => {
    if (phase !== "aim") return;
    if (selectedCarId && availableCars.some((car) => car.id === selectedCarId)) return;
    setSelectedCarId(availableCars[0]?.id ?? null);
  }, [availableCars, selectedCarId, phase]);

  const selectedCar = useMemo(
    () => cars.find((car) => car.id === selectedCarId) ?? null,
    [cars, selectedCarId]
  );

  const finalizeRound = useCallback(() => {
    setSummaryOpen(true);
  }, []);

  const advanceTurn = useCallback(() => {
    setAim(null);
    setPreview([]);
    setSelectedCarId(null);
    setPhase((prev) => {
      if (turnIndex + 1 >= TOTAL_TURNS) {
        finalizeRound();
        return "summary";
      }
      return "aim";
    });
    setTurnIndex((prev) => Math.min(prev + 1, TOTAL_TURNS));
  }, [turnIndex, finalizeRound]);

  useEffect(() => {
    if (phase !== "resolving") return;
    const allSettled = cars.every((car) => !car.isActive || car.restTimer >= T_HOLD || (car.state !== CarState.Intact && car.state !== CarState.Burning));
    if (allSettled) {
      advanceTurn();
    }
  }, [cars, phase, advanceTurn]);

  const handleTimeout = useCallback(() => {
    if (!selectedCar) return;
    setCars((prev) =>
      prev.map((car) => {
        if (car.id !== selectedCar.id) return car;
        return {
          ...car,
          used: true,
          isActive: false,
          timedOut: true,
          restTimer: Infinity,
          velocity: { x: 0, y: 0 }
        };
      })
    );
    advanceTurn();
  }, [selectedCar, advanceTurn]);

  const resetShotClock = useCallback(() => {
    if (shotClockRef.current) {
      clearInterval(shotClockRef.current);
    }
    setShotClock(SHOT_CLOCK_SECONDS);
    if (phase !== "aim" || !selectedCar) return;
    shotClockRef.current = setInterval(() => {
      setShotClock((prev) => {
        if (prev <= 0.5) {
          clearInterval(shotClockRef.current!);
          handleTimeout();
          return 0;
        }
        return Number((prev - 0.5).toFixed(1));
      });
    }, 500);
  }, [phase, selectedCar, handleTimeout]);

  useEffect(() => {
    resetShotClock();
    return () => {
      if (shotClockRef.current) clearInterval(shotClockRef.current);
    };
  }, [phase, turnIndex, selectedCar, resetShotClock]);

  const restart = useCallback(() => {
    setCars(createInitialCars());
    setTurnIndex(0);
    setPhase("aim");
    setAim(null);
    setPreview([]);
    setSelectedCarId(null);
    setSummaryOpen(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrame: number;
    let lastTime = performance.now();

    const frame = (time: number) => {
      const dt = Math.min(0.04, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      setCars((prev) => {
        const next = simulate(prev, dt, trees, lowGrip, phase, mode);
        carsRef.current = next;
        return next;
      });
      draw(
        ctx,
        carsRef.current,
        trees,
        lowGrip,
        aim,
        preview,
        selectedCarId,
        phase,
        shotClock,
        activeTeam,
        safeFinish,
        houseZone
      );
      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(animationFrame);
  }, [trees, lowGrip, aim, preview, selectedCarId, phase, mode, shotClock, activeTeam, safeFinish, houseZone]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (phase !== "aim" || !selectedCar) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      const dist = distance(pointer, selectedCar.position);
      if (dist > carRadius(selectedCar) + 32) return;
      setAim({ origin: selectedCar.position, pointer, carId: selectedCar.id });
    },
    [phase, selectedCar]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      setAim((current) => {
        if (!current) return current;
        const car = cars.find((entry) => entry.id === current.carId);
        if (!car) return current;
        const canvas = canvasRef.current;
        if (!canvas) return current;
        const rect = canvas.getBoundingClientRect();
        const pointer = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        };
        const dragVector = subtract(current.origin, pointer);
        const dragLength = magnitude(dragVector);
        const direction = normalize(dragVector);
        const capped = applySoftHardCap(dragLength * POWER_SCALE);
        const velocityMag = capped / carMass(car);
        const launchVelocity = scale(direction, velocityMag);
        const friction = carFriction(car, 0);
        setPreview(computePreview(car, launchVelocity, friction));
        return { ...current, pointer };
      });
    },
    [cars]
  );

  const handlePointerUp = useCallback(() => {
    if (!aim) return;
    const car = cars.find((entry) => entry.id === aim.carId);
    if (!car || car.used || phase !== "aim") {
      setAim(null);
      setPreview([]);
      return;
    }
    const dragVector = subtract(aim.origin, aim.pointer);
    const dragLength = magnitude(dragVector);
    if (dragLength < 6) {
      setAim(null);
      setPreview([]);
      return;
    }
    const direction = normalize(dragVector);
    const capped = applySoftHardCap(dragLength * POWER_SCALE);
    const velocityMag = capped / carMass(car);
    const launchVelocity = scale(direction, velocityMag);
    setCars((prev) =>
      prev.map((entry) => {
        if (entry.id !== car.id) return entry;
        return {
          ...entry,
          used: true,
          isActive: true,
          velocity: launchVelocity,
          restTimer: 0,
          state: entry.stage === 1 ? CarState.Burning : CarState.Intact
        };
      })
    );
    setPhase("resolving");
    setAim(null);
    setPreview([]);
  }, [aim, cars, phase]);

  const scoreData = useMemo(() => {
    return cars.reduce(
      (acc, car) => {
        if (!car.used && !car.timedOut) return acc;
        const breakdown = computeScore(car, { safeFinish, houseZone });
        acc[car.team].push(breakdown);
        acc.total[car.team] += breakdown.total;
        return acc;
      },
      {
        A: [] as ScoreBreakdown[],
        B: [] as ScoreBreakdown[],
        total: { A: 0, B: 0 }
      }
    );
  }, [cars, safeFinish, houseZone]);

  const modeDescription = useMemo(() => {
    switch (mode) {
      case "Classic":
        return "Balanced damage thresholds and burning penalties.";
      case "Hard Crash":
        return "Lower damage threshold – expect more wrecks.";
      case "Zen":
        return "No damage; pure placement battle.";
    }
  }, [mode]);

  const treesPinnedCars = useMemo(() => {
    if (!crowdControl) return new Set<string>();
    const pinned = new Set<string>();
    cars.forEach((car) => {
      if (detectPinned(car, trees)) pinned.add(car.id);
    });
    return pinned;
  }, [cars, trees, crowdControl]);

  useEffect(() => {
    if (!crowdControl) return;
    setCars((prev) =>
      prev.map((car) => {
        if (!treesPinnedCars.has(car.id)) return car;
        return {
          ...car,
          velocity: { x: 0, y: 0 },
          isActive: false,
          restTimer: Infinity
        };
      })
    );
  }, [crowdControl, treesPinnedCars]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
        maxWidth: "1200px",
        margin: "0 auto"
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px"
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.8rem" }}>Canyon Curlers</h1>
          <p style={{ margin: 0, opacity: 0.8 }}>{modeDescription}</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <label>
            Mode:
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as RuleMode);
                restart();
              }}
              style={{ marginLeft: "8px" }}
            >
              <option>Classic</option>
              <option>Hard Crash</option>
              <option>Zen</option>
            </select>
          </label>
          <label>
            Map:
            <select
              value={variant}
              onChange={(event) => {
                setVariant(event.target.value as Variant);
                restart();
              }}
              style={{ marginLeft: "8px" }}
            >
              <option>Classic Canyon</option>
              <option>Serpentine</option>
              <option>River Bridge</option>
            </select>
          </label>
          <button onClick={restart} style={{ padding: "8px 16px" }}>
            Reset Round
          </button>
        </div>
      </header>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 280px",
          gap: "16px",
          alignItems: "start"
        }}
      >
        <div>
          <canvas
            ref={canvasRef}
            width={ARENA_WIDTH}
            height={ARENA_HEIGHT}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              width: "100%",
              borderRadius: "12px",
              border: "3px solid #1f2937",
              background: "#0f172a",
              touchAction: "none"
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "12px",
              flexWrap: "wrap",
              gap: "8px"
            }}
          >
            <div>
              <strong>Turn:</strong> {turnIndex + 1} / {TOTAL_TURNS} • <strong>Active Team:</strong> {activeTeam}
            </div>
            <div>
              <strong>Shot clock:</strong> {shotClock.toFixed(1)}s
            </div>
            <div>
              <strong>Phase:</strong> {phase}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <label>
                <input
                  type="checkbox"
                  checked={safeFinish}
                  onChange={(event) => setSafeFinish(event.target.checked)}
                />
                Safe Finish bonus
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={houseZone}
                  onChange={(event) => setHouseZone(event.target.checked)}
                />
                House zone bonus
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={crowdControl}
                  onChange={(event) => setCrowdControl(event.target.checked)}
                />
                Crowd control penalty
              </label>
            </div>
          </div>
        </div>

        <aside
          style={{
            background: "rgba(15,23,42,0.7)",
            borderRadius: "12px",
            padding: "12px",
            border: "1px solid rgba(148,163,184,0.3)",
            backdropFilter: "blur(6px)",
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }}
        >
          <section>
            <header
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Car roster</h2>
              <button
                onClick={() => setShowTutorial((prev) => !prev)}
                style={{ padding: "4px 8px", fontSize: "0.85rem" }}
              >
                {showTutorial ? "Hide tutorial" : "Show tutorial"}
              </button>
            </header>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {(["A", "B"] as TeamId[]).map((team) => (
                <div key={team}>
                  <h3 style={{ margin: "8px 0 4px" }}>
                    Team {team}
                  </h3>
                  {cars
                    .filter((car) => car.team === team)
                    .map((car) => {
                      const archetype = ARCHETYPES[car.archetype];
                      const isSelectable =
                        phase === "aim" && car.team === activeTeam && !car.used;
                      const isSelected = selectedCar?.id === car.id;
                      const statusLabel = car.timedOut
                        ? "Timed out"
                        : car.state === CarState.Destroyed
                        ? "Destroyed"
                        : car.state === CarState.Drowned
                        ? "Drowned"
                        : car.stage === 1
                        ? "Burning"
                        : car.used
                        ? "Scored"
                        : "Ready";
                      return (
                        <button
                          key={car.id}
                          disabled={!isSelectable}
                          onClick={() => {
                            if (!isSelectable) return;
                            setSelectedCarId(car.id);
                            setAim({ origin: car.position, pointer: car.position, carId: car.id });
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px",
                            borderRadius: "8px",
                            border: isSelected
                              ? "2px solid #facc15"
                              : "1px solid rgba(148,163,184,0.3)",
                            background: isSelectable
                              ? "rgba(56,189,248,0.12)"
                              : "rgba(30,41,59,0.4)",
                            cursor: isSelectable ? "pointer" : "default"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>
                              {car.archetype}
                              {car.stage === 1 ? " 🔥" : ""}
                            </span>
                            <span style={{ opacity: 0.8, fontSize: "0.85rem" }}>{statusLabel}</span>
                          </div>
                          <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>
                            mass {archetype.mass.toFixed(1)} • friction {archetype.friction.toFixed(2)} • bounce {archetype.bounciness.toFixed(2)}
                          </div>
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          </section>
          {showTutorial && (
            <section style={{ fontSize: "0.85rem", lineHeight: 1.4 }}>
              <h3 style={{ margin: "8px 0" }}>How to play</h3>
              <ol style={{ paddingLeft: "20px", margin: 0 }}>
                <li>Pick a car from your active team’s roster.</li>
                <li>Press near the car, drag to aim, release to launch.</li>
                <li>Turns alternate between teams; wait for motion to stop.</li>
                <li>Heavy collisions ignite cars; a second heavy hit destroys them.</li>
                <li>Burning cars score half points; drowned/destroyed score zero.</li>
              </ol>
            </section>
          )}
          <section>
            <h3 style={{ margin: "8px 0" }}>Scoreboard snapshot</h3>
            <div style={{ display: "flex", gap: "12px" }}>
              <div>
                <strong>Team A</strong>
                <div>{scoreData.total.A} pts</div>
              </div>
              <div>
                <strong>Team B</strong>
                <div>{scoreData.total.B} pts</div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {summaryOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            padding: "24px"
          }}
        >
          <div
            style={{
              background: "rgba(15,23,42,0.95)",
              borderRadius: "16px",
              padding: "24px",
              width: "min(900px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              border: "1px solid rgba(148,163,184,0.4)"
            }}
          >
            <h2 style={{ marginTop: 0 }}>Round summary</h2>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
              {(["A", "B"] as TeamId[]).map((team) => (
                <div key={team} style={{ flex: "1 1 320px" }}>
                  <h3>
                    Team {team} — {scoreData.total[team]} pts
                  </h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left" }}>
                        <th style={{ borderBottom: "1px solid rgba(148,163,184,0.4)" }}>Car</th>
                        <th style={{ borderBottom: "1px solid rgba(148,163,184,0.4)" }}>State</th>
                        <th style={{ borderBottom: "1px solid rgba(148,163,184,0.4)" }}>Base</th>
                        <th style={{ borderBottom: "1px solid rgba(148,163,184,0.4)" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scoreData[team].map((breakdown) => (
                        <tr key={breakdown.car.id}>
                          <td>{breakdown.car.archetype}</td>
                          <td style={{ opacity: 0.8 }}>
                            {breakdown.car.timedOut
                              ? "Timed out"
                              : breakdown.car.state === CarState.Drowned
                              ? "Drowned"
                              : breakdown.car.state === CarState.Destroyed
                              ? "Destroyed"
                              : breakdown.car.stage === 1
                              ? "Burning"
                              : "Intact"}
                          </td>
                          <td>{breakdown.base}</td>
                          <td>
                            {breakdown.total}
                            <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                              {breakdown.modifiers.join(", ") || "—"}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px" }}>
              <button onClick={() => setSummaryOpen(false)}>Close</button>
              <button onClick={restart}>Rematch</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function simulate(
  previousCars: Car[],
  dt: number,
  trees: Tree[],
  lowGrip: typeof ICE_PATCHES,
  phase: GamePhase,
  mode: RuleMode
): Car[] {
  if (dt <= 0 || phase !== "resolving") return previousCars;
  const updated = previousCars.map((car) => ({
    ...car,
    position: { ...car.position },
    velocity: { ...car.velocity }
  }));
  const threshold = getDamageThreshold(mode);

  for (const car of updated) {
    if (!car.isActive) continue;
    if (car.state === CarState.Destroyed || car.state === CarState.Drowned) {
      car.isActive = false;
      car.velocity = { x: 0, y: 0 };
      car.restTimer = Infinity;
      continue;
    }
    const archetype = ARCHETYPES[car.archetype];
    const surfaceFriction = computeSurfaceFriction(car.position, lowGrip, archetype.friction);
    car.velocity.x *= 1 - surfaceFriction * dt;
    car.velocity.y *= 1 - surfaceFriction * dt;

    car.position.x += car.velocity.x * dt * 60;
    car.position.y += car.velocity.y * dt * 60;

    applyWallCollisions(car, ARENA_WIDTH, ARENA_HEIGHT);

    if (car.position.y <= RIVER_HEIGHT) {
      car.state = CarState.Drowned;
      car.isActive = false;
      car.velocity = { x: 0, y: 0 };
      car.restTimer = Infinity;
      continue;
    }
  }

  handleCarCollisions(updated, threshold);
  handleTreeCollisions(updated, trees, threshold);

  updated.forEach((car) => {
    if (!car.isActive) return;
    const speed = magnitude(car.velocity);
    if (speed < V_MIN) {
      car.restTimer += dt;
      if (car.restTimer >= T_HOLD) {
        car.isActive = false;
        car.velocity = { x: 0, y: 0 };
      }
    } else {
      car.restTimer = 0;
    }
  });

  return updated;
}

function computeSurfaceFriction(position: Vector, patches: typeof ICE_PATCHES, base: number) {
  let friction = base;
  for (const patch of patches) {
    if (distance(position, patch) <= patch.radius) {
      friction = lerp(base, patch.friction, 0.7);
      break;
    }
  }
  return Math.max(0.01, friction);
}

function applyWallCollisions(car: Car, width: number, height: number) {
  const radius = carRadius(car);
  if (car.position.x - radius < 0) {
    car.position.x = radius;
    car.velocity.x = -car.velocity.x * carBounce(car) * 0.8;
  }
  if (car.position.x + radius > width) {
    car.position.x = width - radius;
    car.velocity.x = -car.velocity.x * carBounce(car) * 0.8;
  }
  if (car.position.y - radius < 0) {
    car.position.y = radius;
    car.velocity.y = -car.velocity.y * carBounce(car) * 0.85;
  }
  if (car.position.y + radius > height) {
    car.position.y = height - radius;
    car.velocity.y = -car.velocity.y * carBounce(car) * 0.85;
  }
}

function handleCarCollisions(cars: Car[], threshold: number) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (!a.used || !b.used) continue;
      if (a.state === CarState.Destroyed || b.state === CarState.Destroyed) continue;
      const radiusSum = carRadius(a) + carRadius(b);
      const delta = subtract(b.position, a.position);
      const dist = magnitude(delta);
      if (dist === 0 || dist > radiusSum) continue;
      const normal = normalize(delta);
      const relativeVelocity = subtract(b.velocity, a.velocity);
      const relNormal = dot(relativeVelocity, normal);
      if (relNormal > 0) continue;

      const massA = carMass(a);
      const massB = carMass(b);
      const restitution = Math.min(carBounce(a), carBounce(b));
      const impulse = (-(1 + restitution) * relNormal) / (1 / massA + 1 / massB);
      const impulseVector = scale(normal, impulse);
      a.velocity = subtract(a.velocity, scale(impulseVector, 1 / massA));
      b.velocity = add(b.velocity, scale(impulseVector, 1 / massB));

      const overlap = radiusSum - dist + 0.5;
      a.position = subtract(a.position, scale(normal, overlap * (massB / (massA + massB))));
      b.position = add(b.position, scale(normal, overlap * (massA / (massA + massB))));

      const impactForce = Math.abs(relNormal) * (massA + massB) * 0.5;
      if (impactForce > threshold) {
        applyDamage(a, impactForce);
        applyDamage(b, impactForce);
      }
    }
  }
}

function handleTreeCollisions(cars: Car[], trees: Tree[], threshold: number) {
  for (const car of cars) {
    if (!car.used) continue;
    if (car.state === CarState.Destroyed || car.state === CarState.Drowned) continue;
    for (const tree of trees) {
      const radius = carRadius(car) + tree.radius;
      const diff = subtract(car.position, { x: tree.x, y: tree.y });
      const dist = magnitude(diff);
      if (dist >= radius) continue;
      const normal = normalize(diff);
      const overlap = radius - dist + 0.5;
      car.position = add(car.position, scale(normal, overlap));
      const relSpeed = Math.abs(dot(car.velocity, normal)) * carMass(car);
      car.velocity = subtract(car.velocity, scale(normal, dot(car.velocity, normal) * (1 + carBounce(car))));
      if (relSpeed > TREE_DAMAGE_THRESHOLD || relSpeed > threshold * 1.2) {
        applyDamage(car, relSpeed);
      }
    }
  }
}

function applyDamage(car: Car, _impact: number) {
  if (car.state === CarState.Destroyed || car.state === CarState.Drowned) return;
  if (car.stage === 0) {
    car.stage = 1;
    car.state = CarState.Burning;
    car.lastImpact = _impact;
  } else if (car.stage === 1) {
    car.stage = 2;
    car.state = CarState.Destroyed;
    car.isActive = false;
    car.velocity = { x: 0, y: 0 };
    car.restTimer = Infinity;
  }
}

function draw(
  ctx: CanvasRenderingContext2D,
  cars: Car[],
  trees: Tree[],
  lowGrip: typeof ICE_PATCHES,
  aim: AimState | null,
  preview: Vector[],
  selectedCarId: string | null,
  phase: GamePhase,
  shotClock: number,
  activeTeam: TeamId,
  safeFinish: boolean,
  houseZone: boolean
) {
  ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, 0, ARENA_HEIGHT);
  gradient.addColorStop(0, "#1f2937");
  gradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  ctx.fillStyle = "rgba(56,189,248,0.15)";
  ctx.fillRect(0, 0, ARENA_WIDTH, RIVER_HEIGHT);
  ctx.strokeStyle = "rgba(125,211,252,0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, ARENA_WIDTH, RIVER_HEIGHT);

  ctx.fillStyle = "rgba(234,179,8,0.12)";
  ctx.fillRect(FINISH_X - 30, ARENA_HEIGHT / 2 - 80, 60, 160);

  if (houseZone) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(251,191,36,0.5)";
    ctx.lineWidth = 3;
    ctx.arc(HOUSE_ZONE_X, ARENA_HEIGHT / 2, HOUSE_ZONE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }

  lowGrip.forEach((patch) => {
    ctx.beginPath();
    ctx.fillStyle = "rgba(148,163,184,0.2)";
    ctx.arc(patch.x, patch.y, patch.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  trees.forEach((tree) => {
    ctx.beginPath();
    ctx.fillStyle = "#374151";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.arc(tree.x, tree.y, tree.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  cars.forEach((car) => {
    const radius = carRadius(car);
    const archetype = ARCHETYPES[car.archetype];
    const isSelected = car.id === selectedCarId && phase === "aim";
    const baseColor = TEAM_COLORS[car.team];
    let fill: string = archetype.color;
    if (car.state === CarState.Destroyed) {
      fill = "rgba(148,163,184,0.3)";
    } else if (car.state === CarState.Drowned) {
      fill = "rgba(59,130,246,0.3)";
    }

    ctx.beginPath();
    ctx.fillStyle = fill;
    ctx.globalAlpha = car.state === CarState.Destroyed ? 0.6 : 0.9;
    ctx.arc(car.position.x, car.position.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.lineWidth = isSelected ? 4 : 2;
    ctx.strokeStyle = isSelected ? "#facc15" : baseColor;
    ctx.stroke();

    if (car.stage === 1) {
      const flameRadius = radius + 6;
      const flameGradient = ctx.createRadialGradient(
        car.position.x,
        car.position.y,
        radius,
        car.position.x,
        car.position.y,
        flameRadius
      );
      flameGradient.addColorStop(0, "rgba(251,191,36,0.35)");
      flameGradient.addColorStop(1, "rgba(249,115,22,0)");
      ctx.beginPath();
      ctx.fillStyle = flameGradient;
      ctx.arc(car.position.x, car.position.y, flameRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "white";
    ctx.font = "bold 14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(car.archetype[0], car.position.x, car.position.y + 4);

    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(226,232,240,0.8)";
    const label = car.state === CarState.Drowned
      ? "Drowned"
      : car.state === CarState.Destroyed
      ? "Destroyed"
      : car.timedOut
      ? "Timeout"
      : car.stage === 1
      ? "Burning"
      : car.used
      ? "Scored"
      : "Ready";
    ctx.fillText(label, car.position.x + radius + 6, car.position.y + 4);
  });

  if (preview.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(148,163,184,0.6)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.moveTo(preview[0].x, preview[0].y);
    for (let i = 1; i < preview.length; i += 1) {
      ctx.lineTo(preview[i].x, preview[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (aim && phase === "aim") {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(250,204,21,0.9)";
    ctx.lineWidth = 2;
    ctx.moveTo(aim.origin.x, aim.origin.y);
    ctx.lineTo(aim.pointer.x, aim.pointer.y);
    ctx.stroke();

    const dragVector = subtract(aim.origin, aim.pointer);
    const dragLength = magnitude(dragVector);
    const capped = applySoftHardCap(dragLength * POWER_SCALE);
    ctx.fillStyle = "rgba(15,23,42,0.9)";
    ctx.fillRect(aim.origin.x + 12, aim.origin.y - 28, 90, 24);
    ctx.fillStyle = "#facc15";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Power ${capped.toFixed(0)}`, aim.origin.x + 16, aim.origin.y - 12);
  }

  ctx.fillStyle = "rgba(15,23,42,0.75)";
  ctx.fillRect(12, ARENA_HEIGHT - 60, 210, 48);
  ctx.strokeStyle = "rgba(148,163,184,0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(12, ARENA_HEIGHT - 60, 210, 48);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "12px Inter, sans-serif";
  ctx.fillText(`Phase: ${phase}`, 24, ARENA_HEIGHT - 40);
  ctx.fillText(`Active: Team ${activeTeam}`, 24, ARENA_HEIGHT - 24);
  ctx.fillText(`Shot clock: ${shotClock.toFixed(1)}s`, 120, ARENA_HEIGHT - 24);

  ctx.textAlign = "left";
}
