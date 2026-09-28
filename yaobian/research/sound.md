# Sound: sources

What KILN's crackle rests on: verified at the source, reported as a claim, or an assumption with its range. The recordings are reference only: fetched as Freesound previews into `$TMPDIR/yaobian/ref/sound/` by `node yaobian/tools/sound-references.ts`, measured beside ours, never committed or shipped.

## Recordings measured against

| Freesound | What | By | License | Used for |
|---|---|---|---|---|
| [848463](https://freesound.org/s/848463/) | Taps on a ceramic bowl, ringing free | 3D_Blanco | CC0 | The bowl's ratios and loss, free |
| [855306](https://freesound.org/s/855306/) | A wooden stick on a bowl's rim, the bowl held | GammaGool | CC0 | The bowl's loss, held or resting |

No recording of glaze crazing was found (none on Freesound; the Ru makers' videos cannot be downloaded here).

## Claims

| Claim | Status | Source |
|---|---|---|
| Crazing is audible as pings: in the kiln, strongest at unloading, continuing for hours to years; delayed crazing comes from the body taking up moisture | Verified | [The Pottery Wheel](https://thepotterywheel.com/crazing-in-pottery-glaze/); [Ceramic Arts Network](https://ceramicartsnetwork.org/daily/article/common-glaze-faults-and-how-to-correct-them); [NIST, 1931](https://nvlpubs.nist.gov/nistpubs/jres/6/jresv6n3p457_A2b.pdf) |
| Ru ware's crackle sound is prized: "如磬声", "大珠小珠落玉盘" | Reported | [163.com](https://m.163.com/dy/article/ICGRDDCT055648DT.html); [bilibili](https://www.bilibili.com/video/BV17e411c7Df/) |
| Strain energy, fracture dissipation, and acoustic excitation are distinct | Verified | [Zheng and James](https://www.cs.cornell.edu/projects/FractureSound/files/fractureSound_comp.pdf) |

## Assumptions

| Value | Used | Range |
|---|---|---|
| Fired stoneware E, ν, ρ | 60 GPa, 0.2, 2,350 kg/m³ | 50–80 GPa; moves every frequency together, as √(E/ρ) |
| The glaze, a lime-alkali glass | 70 GPa, 0.22, 2,500 kg/m³ | |
| Dried clay; its raw coat | 4 GPa, 0.25, 1,900; 2 GPa, 1,600: every mode about 0.24 of the fired | 1–10 GPa |
| Loss of the fired bowl while the glaze can still craze | Twice the resting bowl's at 560 °C, falling as the cube of the temperature | Unmeasured |
| A crack's release | a step, every piece of a ping at once | at an assumed 1,000 m/s a 25 mm run takes 25 µs: −2.4 dB at 16 kHz |
| Radiation of each mode | a sphere's mode of its order at the rim's radius | an approximation for an open bowl |
