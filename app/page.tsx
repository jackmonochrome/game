const primarySystems = [
  {
    title: "Teams & Fleet",
    points: [
      "Two competitors (Team A and Team B) trade launches in alternating order.",
      "Each roster features five unique archetypes: Speed, Truck, Buggy, Tank, and Sports.",
      "Cars are defined by fixed match parameters: mass tier, hitbox radius, surface friction, bounciness, and a two-step durability track (Intact → Burning → Destroyed)."
    ]
  },
  {
    title: "Arena",
    points: [
      "Canyon lane with hard walls, static trees, and a lethal river slicing the upper boundary.",
      "Optional surface tiles (sand, mud, ice) adjust grip but never introduce randomness.",
      "Walls bleed momentum via partial elasticity yet never inflict damage; the river immediately drowns any contact."
    ]
  },
  {
    title: "Physics & Flow",
    points: [
      "2D deterministic simulation no matter the camera framing (top-down or pseudo-isometric).",
      "Linear drag models surface friction; collisions are inelastic with configurable bounciness < 1.",
      "Vehicles reach a rest state when speed stays under V_min for T_hold (baseline 0.1 m/s for 1.0 s)."
    ]
  }
];

const archetypes = [
  {
    name: "Speed",
    detail: "Featherweight sprint specialist with the highest power ceiling and the lowest resilience."
  },
  {
    name: "Truck",
    detail: "High mass anchor that excels at blocking lanes and shrugging off knockbacks."
  },
  {
    name: "Buggy",
    detail: "Mid-weight ricochet artist boasting generous bounce for creative banks—with higher river risk."
  },
  {
    name: "Tank",
    detail: "The shoving brute: extremely heavy, barely bouncy, and built for close-quarters control."
  },
  {
    name: "Sports",
    detail: "Balanced precision car with low friction for smooth finesse shots and controlled curving lines."
  }
];

const matchModes = [
  {
    name: "Classic",
    description: "Canonical ruleset described in this codex."
  },
  {
    name: "Hard Crash",
    description: "Lower damage thresholds amplify destruction and shot denial."
  },
  {
    name: "Zen",
    description: "Damage disabled—pure positional duel for distance supremacy."
  },
  {
    name: "Rumble",
    description: "Advanced variant with moving hazards like rolling logs or shifting platforms."
  }
];

const optionalMods = [
  "House zone near the finish applies a ×1.25 scoring multiplier.",
  "River draft adds a subtle upward pull towards danger for daring runs.",
  "Ice patches lower friction locally and extend slide distance.",
  "Seasonal visual swaps refresh the canyon ambience without affecting balance."
];

const onboardingBeats = [
  "Micro tutorial trio: launch basics, ricochet tactics, and knockout interactions.",
  "Offline practice bot with adjustable aggression profiles.",
  "Deterministic replays saved via seed plus input log; perfect for spectators or reviews."
];

export default function Page() {
  return (
    <>
      <header className="hero-card">
        <h1>Ultimate Car River — Game Codex</h1>
        <p>
          A deterministic curling/pétanque-inspired duel where tactical launches, lane positioning, and precise power
          modulation decide the canyon. Built for instant guest multiplayer and ready to deploy on Vercel via Next.js.
        </p>
        <p>
          Every mechanic below is authored for predictability: no dice rolls, no hidden modifiers—just pure skill with
          five distinct vehicle archetypes and a lethal river keeping greedy lines honest.
        </p>
      </header>

      <section>
        <h2>1. Entities & Roles</h2>
        <p>
          Each round features two teams alternating turns. Fleet composition is fixed but freely ordered: select any unused
          car when your clock starts. Cars track state labels—<strong>Active</strong>, <strong>Burning</strong>,
          <strong>Destroyed</strong>, <strong>Drowned</strong>, or <strong>Scored</strong>—which influence both viability
          and scoring.
        </p>
        <div className="grid">
          {primarySystems.map((system) => (
            <article key={system.title} className="tile">
              <h4>{system.title}</h4>
              <ul>
                {system.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>2. Turn Structure</h2>
        <p>
          Launch order mirrors curling and pétanque traditions. Player A fires, then Player B, alternating until the fleet is
          exhausted or vehicles are removed. The active player chooses any unlaunched car, aims via drag input, and releases
          within the <span className="code-tag">20–30s</span> shot clock. Timing out converts the turn into an auto-pass.
        </p>
        <ul>
          <li>Shots resolve fully before the next player acts. Physics must reach rest (speed &lt; V_min for T_hold).</li>
          <li>Power is proportional to drag distance with a gentle soft-cap before an absolute hard limit.</li>
          <li>Aim preview provides early-frame ghost guidance without future collision foresight.</li>
        </ul>
      </section>

      <section>
        <h2>3. Collisions, Damage, and Hazards</h2>
        <p>
          Impact outcomes are deterministic and threshold-based. Light bumps simply exchange impulse; heavy strikes push
          durability down the track. Burning cars remain active but will only score half value at tally.
        </p>
        <ul>
          <li>Heavy impact threshold: relative impulse over <span className="code-tag">DamageThreshold = 30</span>.</li>
          <li>Burning cars destroyed on the next heavy hit (explosion removes them from play).</li>
          <li>Trees damage only when collisions exceed 45; canyon walls never damage.</li>
          <li>Any splash into the river = instant Drowned (0 points and removed).</li>
        </ul>
      </section>

      <section>
        <h2>4. Scoring Philosophy</h2>
        <p>
          Ultimate Car River blends distance racing with positional denial. All scores finalize at the end of the round,
          after every vehicle has settled. Soft, precise shots often outperform reckless power thanks to friction tuning and
          river pressure.
        </p>
        <ul>
          <li>Distance along the forward lane maps to 0–200 points per car.</li>
          <li>Burning state halves the final value (rounded down); Destroyed or Drowned vehicles earn nothing.</li>
          <li>Optional bonuses: Safe Finish (+20) for stopping inside the finish zone, Crowd Control (−10) if pinned between wall and tree.</li>
        </ul>
      </section>

      <section>
        <h2>5. Match End & Tie-Breaks</h2>
        <p>
          Once both teams expend their fleets and the canyon is quiet, the scoreboard enumerates per-car distance, state, and
          modifiers before summing totals. Match formats include single-round, best-of-three, or league play.
        </p>
        <p>
          Ties trigger Sudden Launch: one random archetype each, one shot apiece, farthest surviving car wins. Repeat if
          necessary.
        </p>
      </section>

      <section>
        <h2>6. Archetype Balance Snapshot</h2>
        <div className="grid">
          {archetypes.map((car) => (
            <article key={car.name} className="tile">
              <h4>{car.name}</h4>
              <p>{car.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>7. Multiplayer: Instant Guest Access</h2>
        <p>
          Multiplayer is built for zero-friction onboarding. Players either quick match with auto-generated guest handles or
          create ad-hoc rooms via six-digit codes. Deterministic lockstep networking keeps replays perfect and validates every
          impulse input on both peers.
        </p>
        <ul>
          <li>WebRTC or relay-backed input sync with shared RNG seeds established at match start.</li>
          <li>Shot clock and impulse validation executed locally on each peer for anti-cheat.</li>
          <li>Periodic state hashing detects desync. Players may reconnect within a short window after disconnect.</li>
          <li>Two consecutive timeouts flag an AFK loss.</li>
        </ul>
      </section>

      <section>
        <h2>8. UI, UX, and Audio Identity</h2>
        <p>
          The interface focuses on clarity and non-blocking feedback. Key HUD elements present archetype stats, shot timers,
          and status indicators. Visual effects dramatize damage without halting simulation; explosions linger ~0.7 seconds.
        </p>
        <ul>
          <li>In-turn HUD: car panel (mass, friction, bounce, HP), aim reticle, concede/settings/report buttons.</li>
          <li>End screen: per-car breakdown, totals, rematch and map selection shortcuts.</li>
          <li>Audio mix: adaptive ambient bed escalates from calm to climax, prioritizing the loudest simultaneous impact.</li>
        </ul>
      </section>

      <section>
        <h2>9. Maps & Rule Variants</h2>
        <p>
          Start with the straight canyon dotted with trees, then branch into serpentine routes, pocketed side lanes, narrow
          bridge crossings near the river, or grip-modifying tiles. Rule modes tailor collision severity and chaos levels.
        </p>
        <div className="grid">
          {matchModes.map((mode) => (
            <article key={mode.name} className="tile">
              <h4>{mode.name}</h4>
              <p>{mode.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>10. Optional Event Mods</h2>
        <ul>
          {optionalMods.map((mod) => (
            <li key={mod}>{mod}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>11. Onboarding & Practice</h2>
        <ul>
          {onboardingBeats.map((beat) => (
            <li key={beat}>{beat}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>12. Hosting on Vercel</h2>
        <p>
          This codex ships inside a modern Next.js project so deployment is instant: import the repository into Vercel, use
          the default build command <span className="code-tag">npm run build</span>, and set the output to
          <span className="code-tag">.next</span>. The deterministic ruleset and content render statically, enabling fast
          global distribution with zero backend configuration.
        </p>
      </section>
    </>
  );
}
