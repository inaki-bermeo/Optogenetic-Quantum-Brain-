# From spike to behaviour

When the cascade measures a neuron, the worm acts out what the real animal does when that class of neuron is switched on.
The quantum cascade is the model. The behaviour table is real biology: each row summarises lesion (laser ablation) or
optogenetic activation experiments. Neurons without an established direct effect on movement do nothing, on purpose.

Code: `frontend/js/conducta.js` (table and motor drive), `frontend/js/escena.js` (`actuar`, `setDrive`, `deform`),
`frontend/main.js` (`fire`, `renderConducta`).

## The table

136 of the 302 neurons have a behaviour. The other 166 show "no known movement".

| Neurons | Class | What the worm does | `programa` | Drive | References |
| --- | --- | --- | --- | --- | --- |
| AVA, AVD, AVE | command interneurons | backward (reversal) | `reversa` | −0.8 | Chalfie 1985; Zheng 1999 |
| AVB, PVC | command interneurons | forward | `avance` | +0.8 | Chalfie 1985; Zheng 1999 |
| ALML/R, AVM | head touch receptors | backs away | `reversa` | −0.6 | Chalfie 1985; Stirman 2011; Leifer 2011 |
| PLML/R | tail touch receptors | speeds forward | `avance` | +0.6 | Chalfie 1985; Stirman 2011; Leifer 2011 |
| ASHL/R | nociceptors | escape: reversal, then omega turn | `escape` | −0.8 | Kaplan & Horvitz 1993; Hilliard 2005 |
| RIVL/R, SMDVL/R | turn neurons | deep ventral (omega) turn | `omega` | 0 | Gray 2005 |
| SMDD, RMD, SMB, RME | head motor neurons | head bend | `cabeza` | 0 | Gray 2005 |
| DA, VA, AS | A-type motor neurons | local body bend (backward circuit) | `flexion` | −0.15 | Haspel 2010; Chalfie 1985 |
| DB, VB | B-type motor neurons | local body bend (forward circuit) | `flexion` | +0.15 | Haspel 2010; Chalfie 1985 |
| DD, VD | GABA motor neurons | local muscle relaxation | `relajar` | 0 | McIntire 1993; Liewald 2008 |
| MCL/R, M2, M3, M4 | pharyngeal motor neurons | pharynx pumping | `bombeo` | 0 | Avery & Horvitz 1989; Raizen 1995 |
| NSML/R | food-sensing (serotonin) | slows down and pumps | `bombeo` | d × 0.5 | Sawin 2000 |
| HSNL/R, VC1–6 | egg-laying neurons | egg laying | `puesta` | 0 | Desai 1988; Schafer 2005 |
| RIS | sleep neuron | stops moving (sleep-like quiescence) | `quietud` | d → 0 | Turek 2013, 2016 |
| AIBL/R | navigation interneurons | tendency to reverse | `tendencia` | −0.3 | Gray 2005; Gordus 2015 |
| AIYL/R | navigation interneurons | tendency to keep going forward | `tendencia` | +0.3 | Gray 2005; Li 2014 |
| AIZL/R | navigation interneurons | tendency to turn | `cabeza` | 0 | Gray 2005 |
| AWAL/R, AWCL/R, ASEL/R | chemosensory neurons (smell / taste) | smells food: turns towards it and crawls closer | `olfato` | +0.4 | Bargmann & Horvitz 1991; Bargmann, Hartwieg & Horvitz 1993 |

Patterns match whole names, so `AS\d+` (motor neurons AS1–AS11) never matches the amphid neurons ASH, ASI, ASJ or ASK.

## How it plays

- **After each step.** When a measurement picks a neuron with a behaviour, the worm acts for about 1.6 s (longer for
  `escape` and `omega`), returns to rest, and only then does the next circuit start. The collapse animation needs the
  neurons at their real positions. A neuron that fires again on the next step does not repeat its behaviour.
- **Motor drive.** One signed value `d ∈ [−1, 1]` (−1 backward, +1 forward) collects each neuron's push and decays ×0.6
  per step. AVA and AVB push in opposite directions, so their commands cancel. This is a qualitative stand-in for the
  mutual inhibition between the backward and forward circuits. The swim direction during any behaviour follows the sign
  of `d`. After the cascade, a backward drive makes the worm keep reversing for a few seconds, then it returns to its
  default forward swim.
- **Food (bacteria).** *C. elegans* eats bacteria (in the lab, a lawn of *E. coli* OP50). Neon rods drift around the worm,
  green like GFP-labelled *E. coli* under the microscope and some magenta (mCherry); they are not to scale (a 2 µm
  bacterium would be invisible). The bacteria stay where they are (they only tumble and jitter a little in place). One
  of them, bigger and brighter, is the food the worm interacts with:
  - the food sits 2.5–3 scene units ahead of the mouth. A forward push (AVB, PVC, PLM, B-type motor neurons, AIY…)
    moves the whole worm towards it by 2.3 units per unit of push (`ESTOCADA`), and a backward push (AVA, AVD, AVE,
    ALM, AVM, ASH, AIB…) moves it back towards the tail (`acercarComida(empuje)`, the `uDesp` offset that `wormDeform` and `deform()` add to
    everything that bends with the body);
  - within one laser shot (a whole cascade, `inicioCiclo` … `finCiclo`) the pushes add up: the worm keeps the position
    each step leaves it in, so two forward commands bring it twice as close (at most 3.5 units from its start,
    `DESP_MAX`). When the cascade ends it stays there for 1.6 s (`QUEDARSE`) so the final distance is visible, then
    glides back to its original distance. Outside a cascade a single push holds for 1.6 s and returns;
  - a chemosensory neuron (AWA, AWC, ASE) makes the food glow, sends a ring from it (the smell) and turns the head
    towards it (`giro`), with a small forward push: chemotaxis;
  - a forward command at least as strong as AVB or PVC (push ≥ 0.75, `EMPUJE_COMER`) goes all the way to the food: the
    worm swallows it (the pharynx pumps), `on("comer")` plays the swallow sound and unlocks *First meal*, a later forward push keeps
    going straight ahead, and a new bacterium appears once the worm is back in its place.
- **Motions are curvature, like real muscle.** Every motion is a curvature profile κ(s) along the body (s = 0 head,
  1 tail). `escena.js` integrates the midline from it with the body length held constant (anchored at mid-body) and
  turns each cross-section rigidly with its tangent, so the organs, somas and synapses bend with the body. The table
  goes to the shader as a texture and is mirrored in JS by `deform()` for picking, labels and the camera
  (ventral = −Y in the scene; details in `docs/3d-model.md`).
  - Crawling wave: κ = A·sin(2πs/λ − φ) with λ = 0.65 body lengths (crawling on agar is about 0.6–0.7). The idle swim
    peaks at κ·L = 2.2; reversal reaches about 6.6 and forward about 5.7, a realistic crawling depth (about 40° of
    body angle).
  - `reversa` / `avance`: the wave runs tail → head (backward) or head → tail (forward), faster than the idle swim.
  - `omega`: a uniform ventral curvature of about 290° in total curls the body into a loop.
  - `cabeza`: oscillating curvature in the front 22 % of the body.
  - `flexion`: a Gaussian curvature bump at the neuron's position (about 0.75 rad of turn), dorsal for D*/AS, ventral
    for V*: one side's muscles contract and the body bends there. **Posture memory:** 75 % of the bend stays after
    the gesture (about 0.56 rad, 32°), so the bends of a cascade add up into a posture, dorsal and ventral ones cancel,
    and the whole posture fades with a time constant of 25 s. A qualitative stand-in for muscle tone that outlasts a
    single command, not a measured value.
  - `relajar`: the wave curvature drops around the neuron's position (that segment goes limp), and the posture
    remembered there is erased.
  - `bombeo`: the pharynx pulses about 4 times per second (real pumping reaches about 250 per minute).
  - `puesta`: a small ventral bend at the vulva and an egg (about 55 × 35 µm) leaving the body, next to the embryos
    already waiting in the uterus.
  - `quietud`: no motion and a dimmer body.
  - `olfato`: a static head bend towards the food (`giro`, the front 30 % of the body) on top of a gentle forward crawl.
- **Sound.** `Sonido.conducta(programa)` plays a short, quiet gesture under the collapse sounds: a falling glide for
  reversal (rising for forward), a slow sweep for the omega turn, six clicks at 4 Hz for pumping, a "pop" when the egg
  leaves, a fading tone for quiescence, two short rising "sniffs" for chemosensation and a soft thump for local bends;
  `Sonido.comer()` plays a low "plop" and fast pumping clicks when the worm swallows the food.
- **Camera.** For behaviours that happen in one place (`cabeza`, `flexion`, `relajar`, `bombeo`, `puesta`) the camera
  glides in (0.7 s, to 11 scene units) toward the neuron, or toward the vulva for egg laying, and returns to the viewer's own view (0.6 s)
  when the worm is back at rest. For the omega turn (and the escape that ends in one) the camera instead pans down to frame the whole ventral loop.
  Dragging the camera cancels the flight, and the other whole-body behaviours keep the wide view.
- **Achievements** (`js/juego.js`, `Juego.conducta`), each stating one real fact:
  - *Reflex*: a touch neuron (ALM, AVM, PLM) fired and the worm reacted (Chalfie 1985);
  - *Escape artist*: ASH fired, so the worm reversed and then made an omega turn;
  - *First egg*: an egg-laying neuron (HSN or VC) fired;
  - *Tug of war*: forward and backward command neurons both fired in one cascade, and their pushes cancelled;
  - *Follow your nose*: a chemosensory neuron (AWA, AWC, ASE) fired and the worm turned towards the bacteria;
  - *First meal*: the worm reached a bacterium and swallowed it.
- **Reduced motion.** With `prefers-reduced-motion`, with the swim turned off, or while the canvas is hidden, nothing
  is animated and the cascade does not wait. The behaviour is still described in text and announced to screen readers.

## Accuracy caveats

1. **The cascade is our model.** Real *C. elegans* neurons are classical, and most do not fire action potentials. They
   use graded potentials (Goodman 1998). AWA is one exception (Liu 2018).
2. **One neuron is a simplification.** The mappings come from experiments that activated or removed these neuron classes.
   In the real worm, behaviour comes from whole circuits, and the same neuron can matter differently with context.
3. **Local bends are approximate.** Ventral-cord motor neurons have their cell bodies in the ventral cord, while their
   axons reach dorsal or ventral muscles along a stretch of the body. The bend is placed at the soma's position.
4. **Silence is deliberate.** 166 neurons have no direct, established effect on movement, so they do not move the worm.

## References

- Avery L, Horvitz HR (1989). Pharyngeal pumping continues after laser killing of the pharyngeal nervous system of *C. elegans*. *Neuron* 3:473–485.
- Bargmann CI, Horvitz HR (1991). Chemosensory neurons with overlapping functions direct chemotaxis to multiple chemicals in *C. elegans*. *Neuron* 7:729–742.
- Bargmann CI, Hartwieg E, Horvitz HR (1993). Odorant-selective genes and neurons mediate olfaction in *C. elegans*. *Cell* 74:515–527.
- Chalfie M, Sulston JE, White JG, Southgate E, Thomson JN, Brenner S (1985). The neural circuit for touch sensitivity in *Caenorhabditis elegans*. *J Neurosci* 5:956–964.
- Desai C, Garriga G, McIntire SL, Horvitz HR (1988). A genetic pathway for the development of the *Caenorhabditis elegans* HSN motor neurons. *Nature* 336:638–646.
- Goodman MB, Hall DH, Avery L, Lockery SR (1998). Active currents regulate sensitivity and dynamic range in *C. elegans* neurons. *Neuron* 20:763–772.
- Gordus A, Pokala N, Levy S, Flavell SW, Bargmann CI (2015). Feedback from network states generates variability in a probabilistic olfactory circuit. *Cell* 161:215–227.
- Gray JM, Hill JJ, Bargmann CI (2005). A circuit for navigation in *Caenorhabditis elegans*. *PNAS* 102:3184–3191.
- Haspel G, O'Donovan MJ, Hart AC (2010). Motoneurons dedicated to either forward or backward locomotion in the nematode *Caenorhabditis elegans*. *J Neurosci* 30:11151–11156.
- Hilliard MA, Apicella AJ, Kerr R, Suzuki H, Bazzicalupo P, Schafer WR (2005). In vivo imaging of *C. elegans* ASH neurons: cellular response and adaptation to chemical repellents. *EMBO J* 24:63–72.
- Kaplan JM, Horvitz HR (1993). A dual mechanosensory and chemosensory neuron in *Caenorhabditis elegans*. *PNAS* 90:2227–2231.
- Leifer AM, Fang-Yen C, Gershow M, Alkema MJ, Samuel ADT (2011). Optogenetic manipulation of neural activity in freely moving *Caenorhabditis elegans*. *Nat Methods* 8:147–152.
- Li Z, Liu J, Zheng M, Xu XZS (2014). Encoding of both analog- and digital-like behavioral outputs by one *C. elegans* interneuron. *Cell* 159:751–765.
- Liewald JF, Brauner M, Stephens GJ, Bouhours M, Schultheis C, Zhen M, Gottschalk A (2008). Optogenetic analysis of synaptic function. *Nat Methods* 5:895–902.
- Liu Q, Kidd PB, Dobosiewicz M, Bargmann CI (2018). *C. elegans* AWA olfactory neurons fire calcium-mediated all-or-none action potentials. *Cell* 175:57–70.
- McIntire SL, Jorgensen E, Kaplan J, Horvitz HR (1993). The GABAergic nervous system of *Caenorhabditis elegans*. *Nature* 364:337–341.
- Raizen DM, Lee RYN, Avery L (1995). Interacting genes required for pharyngeal excitation by motor neuron MC in *Caenorhabditis elegans*. *Genetics* 141:1365–1382.
- Sawin ER, Ranganathan R, Horvitz HR (2000). *C. elegans* locomotory rate is modulated by the environment through a dopaminergic pathway and by experience through a serotonergic pathway. *Neuron* 26:619–631.
- Schafer WR (2005). Egg-laying. *WormBook*, doi:10.1895/wormbook.1.38.1.
- Stirman JN, Crane MM, Husson SJ, Wabnig S, Schultheis C, Gottschalk A, Lu H (2011). Real-time multimodal optical control of neurons and muscles in freely behaving *Caenorhabditis elegans*. *Nat Methods* 8:153–158.
- Turek M, Lewandrowski I, Bringmann H (2013). An AP2 transcription factor is required for a sleep-active neuron to induce sleep-like quiescence in *C. elegans*. *Curr Biol* 23:2215–2223.
- Turek M, Besseling J, Spies JP, König S, Bringmann H (2016). Sleep-active neuron specification and sleep induction require FLP-11 neuropeptides to systemically induce sleep. *eLife* 5:e12499.
- Zheng Y, Brockie PJ, Mellem JE, Madsen DM, Maricq AV (1999). Neuronal control of locomotion in *C. elegans* is modified by a dominant mutation in the GLR-1 ionotropic glutamate receptor. *Neuron* 24:347–361.
