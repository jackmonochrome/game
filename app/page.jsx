const sections = [
  {
    id: 'entities-roles',
    title: '1) Entities & Roles',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Teams</strong>: 2 players (A and B).
          </li>
          <li>
            <strong>Fleet</strong>: each has 5 cars with archetypes: <em>Speed</em>, <em>Truck</em>, <em>Buggy</em>, <em>Tank</em>, <em>Sports</em>.
          </li>
          <li>
            <strong>Car parameters</strong> (fixed per match): mass (low/medium/high), size (hitbox radius), friction, bounciness, durability (HP) = 2 hits: <span className="code-tag">Intact → Burning → Destroyed</span>.
          </li>
          <li>
            <strong>States</strong>: <em>Active</em>, <em>Burning</em> (half score), <em>Destroyed</em> (exploded), <em>Drowned</em> (river), <em>Scored</em> (at rest for final tally).
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'arena-environment',
    title: '2) Arena & Environment',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Geometry</strong>: narrow canyon/road with solid walls.
          </li>
          <li>
            <strong>River</strong>: lethal zone along the top edge; crossing the water line → <em>Drowned</em> (removed).
          </li>
          <li>
            <strong>Trees</strong>: static, immovable obstacles (cylinders).
          </li>
          <li>
            <strong>Surface</strong>: base grip with optional tiles (sand/mud/ice).
          </li>
          <li>
            <strong>Walls</strong>: partial elasticity; may bleed energy but no direct damage.
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'camera-physics',
    title: '3) Camera & Physics',
    content: () => (
      <>
        <ul>
          <li>
            <strong>View</strong>: 2D top-down (recommended for clarity) or isometric pseudo-3D (physics still 2D).
          </li>
          <li>
            <strong>Deterministic physics</strong> (no randomness): launch impulse, surface friction (linear drag), inelastic collisions (bounciness &lt; 1).
          </li>
          <li>
            <strong>Rest</strong>: a car is “stopped” if speed &lt; <span className="code-tag">V_min</span> for <span className="code-tag">T_hold</span> (e.g., &lt;0.1 m/s for 1.0 s).
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'turn-order',
    title: '4) Turn Order (Curling/Pétanque flow)',
    content: () => (
      <>
        <ul>
          <li>
            Play in <strong>rounds</strong> with <strong>alternating turns</strong>: A1 → B1 → A2 → B2 … until both used all 5 cars or they’re removed.
          </li>
          <li>
            <strong>Turn</strong>: choose an unused car → aim (drag) → release (impulse).
          </li>
          <li>
            <strong>Shot clock</strong>: 20–30 s; timeout = auto-pass for that slot (counts as zero).
          </li>
          <li>
            After each launch, wait for <strong>full stabilization</strong> (see Rest) before the next player acts.
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'launch',
    title: '5) Launch (Aim + Power)',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Input</strong>: drag-and-release to set direction and power.
          </li>
          <li>
            <strong>Power</strong>: proportional to drag length; <strong>Soft-Cap</strong> (gentle saturation) then <strong>Hard-Cap</strong> (absolute limit).
          </li>
          <li>
            <strong>Angle</strong>: 360°; optional “fine aim” stepping when holding a modifier.
          </li>
          <li>
            <strong>Preview</strong>: short ghost line for the first N frames of the trajectory (ignores future dynamic collisions).
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'collisions-damage',
    title: '6) Collisions & Damage',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Types</strong>: car↔car (dynamic), car↔tree/wall (static).
          </li>
          <li>
            <strong>Impact thresholds</strong>:
            <ul>
              <li>
                <em>Light</em> → no damage, impulse exchange only.
              </li>
              <li>
                <em>Heavy</em> (relative impulse &gt; <span className="code-tag">DamageThreshold</span>) → target (or both) becomes <em>Burning</em> if previously Intact.
              </li>
              <li>
                Second <em>Heavy</em> hit on <em>Burning</em> → <em>Destroyed</em> (explosion, removed).
              </li>
            </ul>
          </li>
          <li>
            <strong>Burning</strong>: visual fire; car remains playable but scores ×0.5 at the end. No burn-over-time kill.
          </li>
          <li>
            <strong>Trees</strong>: can deal damage only on very heavy hits (design threshold).
          </li>
          <li>
            <strong>Walls</strong>: never deal damage; only energy loss per elasticity.
          </li>
          <li>
            <strong>River</strong>: any contact → <em>Drowned</em> immediately (0 points).
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'scoring-objective',
    title: '7) Scoring & Objective',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Objective</strong>: positional duel + distance race, like curling/pétanque with a lane-score.
          </li>
          <li>
            <strong>Base score per car</strong>:
            <ul>
              <li>Distance along the main axis mapped to 0…200 points.</li>
              <li><em>Burning</em> at final tally → ×0.5 (round down).</li>
              <li><em>Destroyed/Drowned</em> → 0.</li>
            </ul>
          </li>
          <li>
            <strong>Score timing</strong>: all scores are locked at end of round, not when an individual car stops.
          </li>
          <li>
            <strong>Optional modifiers</strong> (for variants):
            <ul>
              <li><em>Safe Finish</em> (+20): car stops inside a marked finish zone.</li>
              <li><em>Crowd Control</em> (−10): car ends fully “pinned” between wall and a tree (off by default).</li>
            </ul>
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'round-match-end',
    title: '8) Round & Match End',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Round end</strong>: both sides spent all 5 cars and motion has ceased.
          </li>
          <li>
            Show <strong>scoreboard</strong>: per-car distance, state, multipliers; total.
          </li>
          <li>
            <strong>Match formats</strong>:
            <ul>
              <li><em>Short</em>: single round.</li>
              <li><em>Best of 3</em>.</li>
              <li><em>League</em>: multiple rounds, cumulative.</li>
            </ul>
          </li>
          <li>
            <strong>Tie-break</strong>: <em>Sudden Launch</em> → each gets 1 random archetype → one shot → farthest surviving wins; repeat if tied.
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'car-choice',
    title: '9) Car Choice & Anti-stall',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Free pick order</strong> (no forced rotation).
          </li>
          <li>
            <strong>No repetition</strong>: each of the 5 cars may be launched once per round.
          </li>
          <li>
            <strong>Shot clock</strong>: 20–30 s prevents stalling.
          </li>
          <li>
            <strong>No Undo</strong>: committed launches stand.
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'readability',
    title: '10) Readability & Event Flow',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Non-blocking VFX</strong>: explosions/damage show at least ~0.7 s but don’t freeze physics.
          </li>
          <li>
            <strong>Indicators</strong>:
            <ul>
              <li>State tags (Intact/Burning/Destroyed/Drowned).</li>
              <li>Personal distance ruler line per car.</li>
              <li>Remaining cars tracker per team.</li>
            </ul>
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'audio',
    title: '11) Audio',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Background</strong>: adaptive procedural ambient (calm → tension → climax).
          </li>
          <li>
            <strong>SFX</strong>: launch, skids, hits, explosion, splash.
          </li>
          <li>
            <strong>Mix rule</strong>: prioritize the strongest concurrent impact.
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'maps-variants',
    title: '12) Maps & Variants',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Base map</strong>: straight canyon with sparse trees.
          </li>
          <li>
            <strong>Variants</strong>:
            <ul>
              <li>Serpentine curves; side pockets (“spurs”); narrow bridges near the river; low-grip tiles.</li>
            </ul>
          </li>
          <li>
            <strong>Rule modes</strong>:
            <ul>
              <li><em>Classic</em> (this codex).</li>
              <li><em>Hard Crash</em> (lower damage threshold).</li>
              <li><em>Zen</em> (no damage; pure placement duel).</li>
              <li><em>Rumble</em> (moving logs/platforms—advanced).</li>
            </ul>
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'multiplayer',
    title: '13) Multiplayer: Instant, No Registration',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Join types</strong>:
            <ul>
              <li>
                <strong>Quick Match</strong>: auto-pair with guest nickname.
              </li>
              <li>
                <strong>Room by Code</strong>: host creates a 6-digit code; guest enters it. No accounts/passwords.
              </li>
            </ul>
          </li>
          <li>
            <strong>Net model</strong>: deterministic <strong>lockstep</strong> (input-only sync) over WebRTC or client-server relay. Shared RNG seeds fixed at match start for perfect replays.
          </li>
          <li>
            <strong>Anti-cheat</strong>: validate shot impulse and shot-clock locally on both peers. Periodic state hash checks.
          </li>
          <li>
            <strong>Lobby</strong>: pick map & mode (Classic/Zen/Hard Crash). Guest nicknames, emoji flags.
          </li>
          <li>
            <strong>Rematch</strong>: “Play again” with same participants.
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'disconnects-latency',
    title: '14) Disconnects & Latency',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Rejoin</strong>: reconnect within N seconds; deterministic state restores seamlessly.
          </li>
          <li>
            <strong>Lag handling</strong>:
            <ul>
              <li>Turn-based: only input commits require confirmation.</li>
              <li>Rendering is local; authoritative confirmation on opponent input receipt.</li>
            </ul>
          </li>
          <li>
            <strong>AFK rule</strong>: two consecutive timeouts → technical loss.
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'ui-ux',
    title: '15) UI & UX',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Start</strong>: “Play” → “Quick” / “Room”.
          </li>
          <li>
            <strong>In-turn HUD</strong>: car panel (mass/friction/bounce/HP); aim reticle with live power limiter; buttons: “Concede”, “Settings”, “Report”.
          </li>
          <li>
            <strong>End screen</strong>: per-car breakdown (distance, state, multiplier). Total score; “Rematch” and “Change Map”.
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'archetype-balance',
    title: '16) Archetype Balance (baseline)',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Speed</strong>: light, low friction, high power cap — long runs, easy to knock away.
          </li>
          <li>
            <strong>Truck</strong>: heavy, high friction — stable blocker, mid damage.
          </li>
          <li>
            <strong>Buggy</strong>: mid mass, high bounce — trick shots/ricochets, higher river risk.
          </li>
          <li>
            <strong>Tank</strong>: very heavy, low bounce — best at shoving, poor max range.
          </li>
          <li>
            <strong>Sports</strong>: mid mass, low friction, precise — angle control & fine placements.
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'tuning-targets',
    title: '17) Clear Tuning Targets (reference values)',
    content: () => (
      <>
        <ul>
          <li>
            <strong>Rest</strong>: <span className="code-tag">V_min = 0.1</span>, <span className="code-tag">T_hold = 1.0 s</span>.
          </li>
          <li>
            <strong>Launch power</strong>: Soft-Cap ≈ 80, Hard-Cap ≈ 100 (abstract units).
          </li>
          <li>
            <strong>Damage</strong>:
            <ul>
              <li><span className="code-tag">DamageThreshold = 30</span> (relative impulse).</li>
              <li>Second heavy hit on <em>Burning</em> ⇒ <em>Destroyed</em>.</li>
              <li>Tree damage only if impact &gt; 45.</li>
            </ul>
          </li>
          <li>
            <strong>Scoring</strong>:
            <ul>
              <li>Distance 0…D_max → 0…200 pts.</li>
              <li>Burning multiplier = 0.5 (round down).</li>
            </ul>
          </li>
        </ul>
      </>
    )
  },
  {
    id: 'curling-spirit',
    title: '18) Curling/Pétanque Spirit',
    content: () => (
      <>
        <ul>
          <li><strong>Zero randomness</strong> in core outcomes.</li>
          <li><strong>Predictability</strong>: aim preview shows only early frames (no “future-collision oracle”).</li>
          <li><strong>Placement &gt; raw power</strong>: friction/bounce tuned so soft, accurate shots are valuable.</li>
        </ul>
      </>
    )
  },
  {
    id: 'optional-mods',
    title: '19) Optional Event Mods',
    content: () => (
      <>
        <ul>
          <li><strong>“House” zone</strong> near finish: multiplier ×1.25 for cars that stop inside.</li>
          <li><strong>River draft</strong>: subtle upward pull near water for risk/reward.</li>
          <li><strong>Ice patches</strong>: local low friction → longer glides.</li>
          <li><strong>Seasons</strong>: visual themes; no balance change.</li>
        </ul>
      </>
    )
  },
  {
    id: 'onboarding',
    title: '20) Onboarding & Practice',
    content: () => (
      <>
        <ul>
          <li><strong>Tutorial</strong>: 3 micro-lessons (launch, bounce, knock-out).</li>
          <li><strong>Practice</strong>: offline vs. bot (aggression presets).</li>
          <li><strong>Replays</strong>: save/share by seed + input log; spectators can watch deterministic playback.</li>
        </ul>
      </>
    )
  }
];

const quickLinks = sections.map((section) => ({ id: section.id, title: section.title }));

export default function Page() {
  return (
    <main>
      <header>
        <p className="code-tag">Deterministic Multiplayer Ruleset</p>
        <h1>Ultimate Car River — Game Codex</h1>
        <p>
          Competitive curling/pétanque energy with precision physics. Designed for top-down or
          pseudo-isometric play, ready for instant guest multiplayer hosting via Vercel.
        </p>
      </header>

      <section aria-labelledby="table-of-contents">
        <h2 id="table-of-contents">Codex Index</h2>
        <ul>
          {quickLinks.map((link) => (
            <li key={link.id}>
              <a href={`#${link.id}`}>{link.title}</a>
            </li>
          ))}
        </ul>
      </section>

      {sections.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
          <h2 id={`${section.id}-title`}>{section.title}</h2>
          {section.content()}
        </section>
      ))}

      <p className="footer">
        Host on Vercel with Next.js for frictionless guest multiplayer deployment and deterministic
        replays.
      </p>
    </main>
  );
}
