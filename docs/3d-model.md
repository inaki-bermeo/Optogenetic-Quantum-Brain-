# Modelo 3D: convenciones compartidas

Datos, app y Blender usan el mismo marco de referencia, así que un modelo editado en Blender se puede usar en la app sin cambiar código. Las constantes de la app están en `frontend/js/escena.js` (`S_AP`, `S_TR`, `GLTF_SCALE`).

| Marco | Ejes | Unidad |
| --- | --- | --- |
| **Datos** (`backend/data/neurons.json`) | x = izquierda–derecha, y = anteroposterior (cabeza < 0), z = dorsoventral | µm |
| **Blender** | X = x, Y = y, Z = z (Z arriba) | 1 unidad = 100 µm |
| **glTF / `gusano.glb`** | (X, Y, Z) = (x, z, −y) · 0,01 (Y arriba; lo mismo que exporta Blender con *+Y Up*) | 1 unidad = 100 µm |
| **App (three.js)** | X = (y − y_centro)·0,02, Y = (z − z_medio)·0,028, Z = (x − x_medio)·0,028 | escena; ejes transversales ×1,4 |

## El archivo `backend/data/gusano.glb`

- Lo lee Python (`cerebro_q/datos.py`) y se lo pasa a la página en base64, porque en Qollab JS no puede leer archivos del proyecto. `frontend/js/escena.js` (`_loadBody`) lo convierte al marco de la app y recalcula las normales.
- **Órganos por nombre** (`ORGANOS` en `escena.js`; sin distinguir mayúsculas): `Cuerpo`, `Faringe`, `Faringe_grinder` (o `grinder`), `Anillo`, `Intestino`, `Gonada`, `Huevos`. Cada uno recibe su propio material de microscopio de fluorescencia (`MATERIAL_ORGANO`). Si el archivo no trae `Intestino`, la página lo arma a lo largo de la línea media; un `.glb` viejo con sólo cuerpo y faringe sigue funcionando.
- **Extras glTF** del objeto `Cuerpo`: `largo_um`, `radio_max_um`, `vulva_um` y `ano_um` (µm, marco de datos). La app usa `vulva_um` para el huevo de la conducta "puesta" y el acercamiento de cámara.
- **Sin archivo:** si `gusano.glb` no existe o no se puede leer, la página arma un cuerpo aproximado por su cuenta.

## Regenerarlo con Blender

El modelo sale entero de `tools/blender/modelo_gusano.py` (Blender 4.2+ con su numpy; probado en 5.2). Desde WSL:

```bash
B="/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" --background --factory-startup --python "$(wslpath -w tools/blender/modelo_gusano.py)" -- \
  --neurons "$(wslpath -w backend/data/neurons.json)" --out "$(wslpath -w backend/data/gusano.glb)" \
  [--blend "$(wslpath -w escena_gusano.blend)"] [--preview "$(wslpath -w capturas/)"]
python tools/optimize_glb.py        # quita normales e índices de 32 bits si los hubiera
```

`--preview` renderiza vistas lateral, ventral, de la cabeza y de la vulva (Workbench en rayos X) para revisar el modelo; `--blend` guarda la escena para retocarla a mano (después, exportar con *+Y Up*, `.glb`, sin mover ni escalar los objetos). El script imprime cuántos somas quedan dentro del cuerpo (hoy 302/302) y el archivo pesa ~600 KB.

## Anatomía (hermafrodita adulto, el sexo del conectoma de Cook 2019)

Proporciones estilizadas a partir de WormAtlas / WormBook (Altun & Hall, *Hermaphrodite anatomy*). Todo sigue la misma línea media que la nube de somas, así que los 302 somas quedan dentro del cuerpo y una sola cinemática dobla cuerpo, órganos y neuronas.

- **Cuerpo:** postura del modelo de OpenWorm; nariz redondeada con **6 labios** alrededor de la boca; radio anatómico (máximo ~40 µm) o el necesario para contener los somas; **alas laterales** (crestas de la cutícula a los costados); **vulva** ventral a mitad del cuerpo (hendidura con labios); **ano** ventral (~88 % del largo) y **cola post-anal** que se afina en un látigo; **poro excretor** ventral junto al bulbo terminal. Los anillos de la cutícula los dibuja el shader.
- **Faringe:** cavidad bucal → procorpus → **metacorpus** (bulbo medio, 45 %) → **istmo** → **bulbo terminal** (87 %), en el primer ~15 % del largo, con el **triturador** de tres lóbulos dentro del bulbo terminal. Se ensancha con la conducta "bombeo".
- **Anillo nervioso:** un toro alrededor del istmo, donde está la mayor parte del neuropilo de la cabeza.
- **Intestino:** 9 anillos de células (int1–int9, 20 células) desde el bulbo terminal hasta el ano, con constricciones entre anillos y el giro de ~180° del intestino real.
- **Gónada:** dos brazos en U (anterior y posterior) que salen ventrales de la vulva, giran hacia dorsal y vuelven, con ovocitos que crecen hacia la espermateca.
- **Huevos:** seis embriones (~45 × 27 µm) en el útero, a los costados de la vulva.

## Movimiento: cinemática de curvatura

- En la escena, Y es el eje dorsoventral y **ventral = −Y** (los somas del cordón ventral, VA y DA, tienen z medio de −21 µm frente a +19,5 µm del total). El gusano real se dobla dorsoventralmente.
- Cada movimiento es un perfil de **curvatura** κ(s) a lo largo del cuerpo (s = 0 cabeza, 1 cola), como la producen los músculos: la onda del reptar κ = A·sin(2πs/λ − φ) con λ ≈ 0,65 largos (avance: φ crece y la onda va de la cabeza a la cola; reversa: al revés), la flexión o relajación local, la oscilación de la cabeza y el giro omega (curvatura ventral uniforme, ~290°). Ver `docs/behaviour.md`.
- `escena.js` integra la línea media con el **largo constante** (anclada a mitad del cuerpo) y cada sección **gira rígida** con su tangente. La tabla (64 muestras a lo largo de x) viaja en una textura (`uCurva`) que usan todos los materiales; `deform()` repite la cuenta en JS para picking, etiquetas y cámara. Así órganos, somas y sinapsis se doblan con el cuerpo a cualquier amplitud.
