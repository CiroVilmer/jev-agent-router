# Jev sobre todos los casos · 2026-10-09-1339-jev-todos.json

## Todos los casos (729)

### Jev solo, por tipo de referencia

| referencia | n | Jev acierta | confusiones más comunes |
|---|---|---|---|
| build-large | 100 | 55.0% | build-small 45 |
| build-small | 117 | 95.7% | build-large 4, explore 1 |
| explore | 26 | 73.1% | build-small 5, build-large 1, review 1 |
| fix | 52 | 61.5% | review-final 14, build-small 4, build-large 2 |
| re-review | 124 | 100.0% |  |
| research | 23 | 39.1% | build-small 13, write 1 |
| review | 225 | 98.7% | re-review 3 |
| review-final | 25 | 100.0% |  |
| write | 37 | 24.3% | build-small 18, build-large 10 |
| **total** | 729 | **83.3%** | |

### Donde hoy deciden las reglas (462 casos)

Reglas 96.5% · Jev solo 92.4%
Desacuerdos: 33 · tiene razón Jev 5 · tiene razón la regla 24 · ninguno 4
Desacuerdos con Jev ≥ 0.9: 4 · tiene razón Jev 2

### Calibración de Jev (todos los casos)

| confianza | n | acierta |
|---|---|---|
| 0–0.5 | 40 | 40.0% |
| 0.5–0.7 | 53 | 47.2% |
| 0.7–0.9 | 131 | 64.1% |
| 0.9–1 | 505 | 95.4% |

### Política: Jev decide y, si duda, decide la regla

| variante | total | reviews | builds | fix |
|---|---|---|---|---|
| fase 5 tal como corría (respaldo anterior) | 88.5% | 98.9% | 88.9% | 71.2% |
| fase 5 con el respaldo nuevo | 88.1% | 98.9% | 87.6% | 71.2% |
| fase 5 con el respaldo nuevo, sin Jev en talla ni reviews | 90.4% | 98.9% | 95.4% | 71.2% |
| Jev primero, umbral 0 | 83.3% | 99.2% | 77.0% | 61.5% |
| Jev primero, umbral 0.5 | 84.6% | 99.5% | 77.4% | 73.1% |
| Jev primero, umbral 0.7 | 86.4% | 99.7% | 82.5% | 73.1% |
| Jev primero, umbral 0.8 | 87.5% | 99.5% | 86.6% | 71.2% |
| Jev primero, umbral 0.9 | 89.6% | 99.5% | 92.6% | 71.2% |
| Jev primero, umbral 0.95 | 90.1% | 99.2% | 94.5% | 71.2% |
| fase 6: Jev decide reviews + talla nueva | 90.5% | 99.2% | 95.4% | 71.2% |
| híbrido: Jev en reviews + talla, umbral 0.7 | 88.5% | 99.7% | 87.6% | 71.2% |
| híbrido: Jev en reviews + talla, umbral 0.8 | 88.3% | 99.5% | 87.6% | 71.2% |
| híbrido: Jev en reviews + talla, umbral 0.9 | 88.3% | 99.5% | 87.6% | 71.2% |

## Solo etiquetas seguras (633)

### Jev solo, por tipo de referencia

| referencia | n | Jev acierta | confusiones más comunes |
|---|---|---|---|
| build-large | 65 | 70.8% | build-small 19 |
| build-small | 79 | 100.0% |  |
| explore | 21 | 85.7% | build-small 3 |
| fix | 49 | 65.3% | review-final 14, build-small 2, build-large 1 |
| re-review | 124 | 100.0% |  |
| research | 21 | 42.9% | build-small 11, write 1 |
| review | 223 | 99.1% | re-review 2 |
| review-final | 25 | 100.0% |  |
| write | 26 | 23.1% | build-small 13, build-large 7 |
| **total** | 633 | **88.5%** | |

### Donde hoy deciden las reglas (458 casos)

Reglas 97.2% · Jev solo 93.0%
Desacuerdos: 29 · tiene razón Jev 4 · tiene razón la regla 23 · ninguno 2
Desacuerdos con Jev ≥ 0.9: 4 · tiene razón Jev 2

### Calibración de Jev (todos los casos)

| confianza | n | acierta |
|---|---|---|
| 0–0.5 | 31 | 38.7% |
| 0.5–0.7 | 46 | 47.8% |
| 0.7–0.9 | 91 | 76.9% |
| 0.9–1 | 465 | 98.1% |

### Política: Jev decide y, si duda, decide la regla

| variante | total | reviews | builds | fix |
|---|---|---|---|---|
| fase 5 tal como corría (respaldo anterior) | 93.5% | 99.2% | 97.9% | 75.5% |
| fase 5 con el respaldo nuevo | 93.4% | 99.2% | 97.2% | 75.5% |
| fase 5 con el respaldo nuevo, sin Jev en talla ni reviews | 93.8% | 99.2% | 99.3% | 75.5% |
| Jev primero, umbral 0 | 88.5% | 99.5% | 86.8% | 65.3% |
| Jev primero, umbral 0.5 | 90.2% | 99.7% | 86.8% | 77.6% |
| Jev primero, umbral 0.7 | 92.3% | 100.0% | 93.1% | 77.6% |
| Jev primero, umbral 0.8 | 92.9% | 99.7% | 96.5% | 75.5% |
| Jev primero, umbral 0.9 | 93.7% | 99.7% | 98.6% | 75.5% |
| Jev primero, umbral 0.95 | 93.8% | 99.5% | 99.3% | 75.5% |
| fase 6: Jev decide reviews + talla nueva | 94.0% | 99.5% | 99.3% | 75.5% |
| híbrido: Jev en reviews + talla, umbral 0.7 | 93.8% | 100.0% | 97.2% | 75.5% |
| híbrido: Jev en reviews + talla, umbral 0.8 | 93.7% | 99.7% | 97.2% | 75.5% |
| híbrido: Jev en reviews + talla, umbral 0.9 | 93.7% | 99.7% | 97.2% | 75.5% |

Latencia Jev: p50 253 ms · p95 304 ms · errores 0
