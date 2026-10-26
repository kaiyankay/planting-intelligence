# Visual design notes

The interface is meant to read as a contemporary landscape-design workspace rather than an analytics dashboard: warm off-white paper, forest green, a restrained ochre for conditions and slate for unknowns, serif for statements and headings, Inter for interface text, and a monospace face only for record ids.

Decisions and where they came from:
- **Conceptual composition diagrams** (`src/components/ConceptDiagram.tsx`) use three drawing languages so the strategies differ at a glance: a left-to-right season relay of flower-coloured drifts in front of a continuous evergreen band (A); a body of overlapping native masses with the colour accent gathered as a cluster of dots at the threshold (B); few large, evenly spaced single-species groups, evergreen solid and deciduous dashed (C). The abstraction level follows concept-stage landscape sketches rather than planting plans: no boundary, no dimensions, no counts, and every drawing is labelled "Conceptual composition · Not to scale". Shapes, colours and labels are generated from the strategy's layers and the records' flower colour, flowering season and evergreen fields, and the diagram redraws when a revision changes the plants.
- **Plant palette** rows (thumbnail, common name, scientific name) borrow AsterSketch's plant-palette organisation: a compact, consistent block of representative species per scheme rather than a long list. Photographs are licensed Wikimedia Commons images (see `docs/IMAGE-CREDITS.md`); a species without a licensed photo gets a labelled illustration mark, never a stand-in photo.
- **Seasonal interest matrix** adapts the Plant Matrix idea of reading seasonality as a grid: rows are plants, columns are the four seasons, a coloured dot marks a flowering season the source records, a square marks evergreen foliage (structure, not flowers), and "?" marks a value the source does not state; a small legend under each matrix states this. Nothing is interpolated into months.
- **Card structure** follows Milanote-style visual cards and shadcn/ui's restraint: identical section order on every card (diagram, name, approach, palette, matrix, main benefit, main trade-off), subtle borders, one radius, no shadows or gradients.
- **Negotiation summary** keeps one quiet icon per class (check, triangle, question mark; a cross for knowledge-base limits), two points per column by default, and record ids in small monospace below each sentence so evidence is present but not competing with the conclusion.
- **Before / after comparison** in the feedback pane shows the previous and revised diagrams and matrices side by side, with removed plants struck through and added plants emphasised, all drawn from the stored revision snapshot.

Chart libraries were not needed; the diagrams and matrix are plain SVG and CSS.

Back to the [README](../README.md).
