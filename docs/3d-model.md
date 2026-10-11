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
- Los objetos cuyo nombre contiene `faringe` o `pharynx` se dibujan como faringe; el resto, como cuerpo. El intestino se genera en la página a lo largo de la línea media.
- **Sin archivo:** si `gusano.glb` no existe o no se puede leer, la página arma un cuerpo aproximado por su cuenta.
- **Reemplazarlo:** el generador y la escena de Blender del prototipo están en el historial (`git show 0c3e4e5:backend/scripts/generar_modelo_3d.py`, `git show 0c3e4e5:blender/README.md`). Después de exportar desde Blender (*+Y Up*, `.glb`), corre `python tools/optimize_glb.py` para quitar las normales y usar índices de 16 bits (la mitad de tamaño).

## Anatomía

- **Cuerpo:** sigue la línea media de las neuronas, de modo que la postura (curvatura) es la del modelo de OpenWorm. Tiene la nariz redondeada, la cola en punta y anillos de cutícula sutiles. El radio es la mayor de dos cantidades: un perfil anatómico típico (máximo de unos 40 µm) o el radio necesario para contener los somas. Con esto, 301 de 302 somas quedan dentro del cuerpo.
- **Orientación:** en la escena, Y es el eje dorsoventral y **ventral = −Y** (los somas del cordón ventral, VA y DA, tienen z medio de −21 µm frente a +19,5 µm del total). La onda de nado y las conductas (`docs/behaviour.md`) deforman el cuerpo en este plano, como el gusano real, que se dobla dorsoventralmente.
- **Faringe:** es una aproximación de proporciones. Ocupa el primer 16 % del largo, con el metacorpus al 45 % y el bulbo terminal al 88 %. Sirve para orientar visualmente la cabeza; no es un dato del conectoma.
