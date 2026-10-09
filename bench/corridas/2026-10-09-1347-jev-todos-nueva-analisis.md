# Jev sobre todos los casos · 2026-10-09-1347-jev-todos.json

## Todos los casos (729)

### Jev solo, por tipo de referencia

| referencia | n | Jev acierta | confusiones más comunes |
|---|---|---|---|
| build-large | 100 | 95.0% | build-small 5 |
| build-small | 117 | 92.3% | build-large 9 |
| explore | 26 | 19.2% | build-large 13, build-small 8 |
| fix | 52 | 46.2% | build-small 12, build-large 10, review-final 5 |
| re-review | 124 | 100.0% |  |
| research | 23 | 30.4% | build-small 15, build-large 1 |
| review | 225 | 93.8% | build-large 7, fix 3, build-small 2 |
| review-final | 25 | 100.0% |  |
| write | 37 | 10.8% | build-small 21, build-large 12 |
| **total** | 729 | **82.7%** | |

### Donde hoy deciden las reglas (462 casos)

Reglas 96.5% · Jev solo 85.3%
Desacuerdos: 73 · tiene razón Jev 6 · tiene razón la regla 58 · ninguno 9
Desacuerdos con Jev ≥ 0.9: 11 · tiene razón Jev 2

### Calibración de Jev (todos los casos)

| confianza | n | acierta |
|---|---|---|
| 0–0.5 | 38 | 42.1% |
| 0.5–0.7 | 73 | 52.1% |
| 0.7–0.9 | 118 | 78.0% |
| 0.9–1 | 500 | 91.4% |

### Política: Jev decide y, si duda, decide la regla

| variante | total | reviews | builds | fix |
|---|---|---|---|---|
| pipeline actual (fase 5) | 88.5% | 98.9% | 88.9% | 71.2% |
| Jev primero, umbral 0 | 82.7% | 96.3% | 93.5% | 46.2% |
| Jev primero, umbral 0.5 | 84.2% | 97.9% | 93.1% | 57.7% |
| Jev primero, umbral 0.7 | 86.4% | 99.5% | 92.2% | 67.3% |
| Jev primero, umbral 0.8 | 87.1% | 99.5% | 90.3% | 69.2% |
| Jev primero, umbral 0.9 | 87.1% | 99.5% | 88.9% | 69.2% |
| Jev primero, umbral 0.95 | 86.8% | 98.9% | 85.7% | 69.2% |
| híbrido: Jev en reviews + talla, umbral 0.7 | 88.8% | 99.5% | 88.9% | 71.2% |
| híbrido: Jev en reviews + talla, umbral 0.8 | 88.8% | 99.5% | 88.9% | 71.2% |
| híbrido: Jev en reviews + talla, umbral 0.9 | 88.8% | 99.5% | 88.9% | 71.2% |

## Solo etiquetas seguras (633)

### Jev solo, por tipo de referencia

| referencia | n | Jev acierta | confusiones más comunes |
|---|---|---|---|
| build-large | 65 | 98.5% | build-small 1 |
| build-small | 79 | 100.0% |  |
| explore | 21 | 23.8% | build-large 11, build-small 5 |
| fix | 49 | 49.0% | build-small 10, build-large 9, review-final 5 |
| re-review | 124 | 100.0% |  |
| research | 21 | 33.3% | build-small 13, build-large 1 |
| review | 223 | 93.7% | build-large 7, fix 3, build-small 2 |
| review-final | 25 | 100.0% |  |
| write | 26 | 11.5% | build-small 15, build-large 8 |
| **total** | 633 | **85.3%** | |

### Donde hoy deciden las reglas (458 casos)

Reglas 97.2% · Jev solo 85.6%
Desacuerdos: 70 · tiene razón Jev 5 · tiene razón la regla 58 · ninguno 7
Desacuerdos con Jev ≥ 0.9: 11 · tiene razón Jev 2

### Calibración de Jev (todos los casos)

| confianza | n | acierta |
|---|---|---|
| 0–0.5 | 34 | 35.3% |
| 0.5–0.7 | 66 | 54.5% |
| 0.7–0.9 | 106 | 82.1% |
| 0.9–1 | 427 | 94.8% |

### Política: Jev decide y, si duda, decide la regla

| variante | total | reviews | builds | fix |
|---|---|---|---|---|
| pipeline actual (fase 5) | 93.5% | 99.2% | 97.9% | 75.5% |
| Jev primero, umbral 0 | 85.3% | 96.2% | 99.3% | 49.0% |
| Jev primero, umbral 0.5 | 87.5% | 98.1% | 99.3% | 61.2% |
| Jev primero, umbral 0.7 | 90.4% | 99.7% | 99.3% | 71.4% |
| Jev primero, umbral 0.8 | 91.5% | 99.7% | 97.9% | 73.5% |
| Jev primero, umbral 0.9 | 91.6% | 99.7% | 96.5% | 73.5% |
| Jev primero, umbral 0.95 | 92.1% | 99.2% | 95.1% | 73.5% |
| híbrido: Jev en reviews + talla, umbral 0.7 | 93.8% | 99.7% | 97.9% | 75.5% |
| híbrido: Jev en reviews + talla, umbral 0.8 | 93.8% | 99.7% | 97.9% | 75.5% |
| híbrido: Jev en reviews + talla, umbral 0.9 | 93.8% | 99.7% | 97.9% | 75.5% |

Latencia Jev: p50 255 ms · p95 303 ms · errores 0
