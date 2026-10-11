# From spike to behaviour

When the cascade measures a neuron, the worm acts out what the real animal does when that class of neuron is switched on.
The quantum cascade is the model. The behaviour table is real biology: each row summarises lesion (laser ablation) or
optogenetic activation experiments. Neurons without an established direct effect on movement do nothing, on purpose.

Code: `frontend/js/conducta.js` (table and motor drive), `frontend/js/escena.js` (`actuar`, `setDrive`, `deform`),
`frontend/main.js` (`fire`, `renderConducta`).

## The table

130 of the 302 neurons have a behaviour. The other 172 show "no known movement".

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
- **Motions** (all in the shader, mirrored in JS by `deform()` for picking and labels; ventral = −Y in the scene):
  - `reversa` / `avance`: the body wave runs tail → head (backward) or head → tail (forward), faster than the idle swim.
  - `omega`: a bend deformer curls the whole body about 290° ventrally.
  - `cabeza`: an extra oscillation in the front 22 % of the body.
  - `flexion`: a Gaussian bend centred on the neuron's position along the body, dorsal for D*/AS, ventral for V*.
  - `relajar`: the wave flattens around the neuron's position (that segment goes limp).
  - `bombeo`: the pharynx pulses about 4 times per second (real pumping reaches about 250 per minute).
  - `puesta`: a ventral contraction at the vulva (mid-body) and an egg (about 55 × 35 µm) leaving the body.
  - `quietud`: no motion and a dimmer body.
- **Reduced motion.** With `prefers-reduced-motion`, with the swim turned off, or while the canvas is hidden, nothing
  is animated and the cascade does not wait. The behaviour is still described in text and announced to screen readers.

## Accuracy caveats

1. **The cascade is our model.** Real *C. elegans* neurons are classical, and most do not fire action potentials. They
   use graded potentials (Goodman 1998). AWA is one exception (Liu 2018).
2. **One neuron is a simplification.** The mappings come from experiments that activated or removed these neuron classes.
   In the real worm, behaviour comes from whole circuits, and the same neuron can matter differently with context.
3. **Local bends are approximate.** Ventral-cord motor neurons have their cell bodies in the ventral cord, while their
   axons reach dorsal or ventral muscles along a stretch of the body. The bend is placed at the soma's position.
4. **Silence is deliberate.** 172 neurons have no direct, established effect on movement, so they do not move the worm.

## References

- Avery L, Horvitz HR (1989). Pharyngeal pumping continues after laser killing of the pharyngeal nervous system of *C. elegans*. *Neuron* 3:473–485.
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
