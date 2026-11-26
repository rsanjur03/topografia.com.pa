# topografia.com.pa — Calculadora Gráfica COGO

Aplicación web de herramientas topográficas para **topografia.com.pa**.

## Funcionalidades actuales

- **Poligonal y trazo manual**: coordenada inicial (manual o capturada desde el mapa), ingreso de tramos por **Rumbo y Distancia**, **Azimut** o **Coordenadas directas (E, N, Z)**, cierre de polígono, área (`m²`, `ha`, `varas²`), perímetro y ajuste por **Bowditch (Regla de la Brújula)**.
- **Suite COGO**:
  - Cálculo Inverso (rumbo, azimut, distancia horizontal e inclinada, ΔE/ΔN/ΔZ, pendiente %).
  - Cálculo Directo / Radiación.
  - Intersecciones: Rumbo–Rumbo, Distancia–Distancia (trilateración) y Rumbo–Distancia.
  - Estación y Offset sobre línea base `A → B` (creación y proyección inversa).
  - Subdivisión de línea en `N` tramos iguales.
  - Curva Horizontal Simple (replanteo vial: `Δ`, `T`, `Lc`, `C`, `E`, `M`, `PC`, `PT`, puntos en arco).
- **Mapas base y sistemas de coordenadas**:
  - **UTM WGS84 Zona 17N (Panamá)**, **Zona 18N (Panamá Este / Darién)** y **Sistema Local (Plano CAD)**.
  - Basemaps **Satelital (Esri World Imagery)**, **Híbrido**, **StreetMap (OpenStreetMap)**, **Topográfico** y **Plano CAD** con cuadrícula de coordenadas.
- **Importación CSV / TXT**: soporte para `PNEZD`, `PENZD`, `NEZ`, `ENZ`, `NE`, `EN` con detección automática de separador y vista previa.
- **Exportación DXF (AutoCAD R12 / `AC1009`)**: capas organizadas (`TOPO_POLIGONAL`, `TOPO_PUNTOS`, `TOPO_RUMBOS_DIST`, `TOPO_AREA_CENTRO`, `TOPO_CURVAS`, `TOPO_NORTE`, `TOPO_CUADRICULA`) y **Cuadro de Datos de Campo** dibujado vectorialmente.

## Uso local

Sitio 100% estático (HTML + CSS + JS modular sin bundler). Abre `index.html` directamente o sirve la carpeta con cualquier servidor HTTP estático.
