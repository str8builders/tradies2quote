# Native T2QCAL web input comparison

Generated 9 September 2026 from the actual native catalog and current web definitions. This compares input keys, not numerical or drawing parity. Renamed equivalent fields need manual review. Straight-stair preferredRise/idealRise is explicitly normalized.

95 calculators inspected; 44 have differing input keys. Matching input keys do not prove correct formulas or feature parity.

| Calculator | Native-only keys | Web-only keys |
|---|---|---|
| Baluster spacing (baluster-spacing) | height, memberDepth | — |
| Stair panel layout (stair-panels) | panelHeight, rows, thickness | — |
| Access ramp (access-ramp) | rampWidth, bottomLanding, topLanding | — |
| Equal spacing (equal-spacing) | memberWidth, targetGap, height, memberDepth | width, target |
| Board and batten (board-batten) | height, memberDepth | — |
| Glass balustrade panels (glass-panels) | height, memberDepth | — |
| Wainscoting layout (wainscoting) | memberDepth | — |
| Shelf and drawer spacing (shelf-spacing) | height, memberDepth | — |
| Fastener set-out (fastener-spacing) | height, memberDepth | — |
| Concrete slab (concrete-slab) | density | — |
| Concrete block quantities (block-quantities) | wallDepth | — |
| Block wall circle (circular-block-wall) | blockWidth, blockHeight, bedJoint, blockCount, originHeight | — |
| Masonry arch (masonry-arch) | wallDepth | — |
| Concrete by the bag (concrete-bags) | density | — |
| Strip footing (strip-footing) | waste, bagYield | — |
| Brick quantities (brick-quantities) | wallDepth | — |
| Brick gauge and bond (brick-gauge) | wallDepth | — |
| Round tube miter (tube-miter) | — | parentDiameter |
| Tube through sheet (tube-through-sheet) | — | parentDiameter |
| Round-to-square reducer (round-square-reducer) | facets | — |
| Deck subframe (deck-subframe) | joistWidth, joistDepth, bearerWidth, bearerDepth, boardDepth | — |
| Deck board layout (deck-boards) | boardDepth | — |
| Fence posts and panels (fence-panels) | height, memberDepth | — |
| Arched fence palings (arched-fence) | palingWidth, palingDepth | — |
| Post holes & concrete (post-holes) | postShape, postWidth, postDepth, postDiameter, embedment, waste, bagYield | — |
| Decking screws (decking-screws) | joistWidth, joistDepth, boardDepth | — |
| All-unit converter (all-unit-converter) | fromUnit, toUnit | from, to |
| Length converter (length-converter) | fromUnit, toUnit | — |
| Area converter (area-converter) | fromUnit, toUnit | — |
| Volume converter (volume-converter) | fromUnit, toUnit | — |
| Weight converter (weight-converter) | fromUnit, toUnit | — |
| Arc & circle (arc-circle) | segments | segmentsInput |
| Curved molding (curved-molding) | moldingWidth, moldingDepth | — |
| Compound miter (compound-miter) | width, thickness, tail | — |
| Tile layout (tile-layout) | floorWidth, tileWidth, tileLength, tileDepth, rows | floor, tile, rowsInput |
| Tile quantity and cost (tile-quantity) | materialDepth, cutKerf | — |
| Weatherboard cladding (weatherboard) | openingArea | — |
| Circular paving patio (circular-paving) | paverThickness, joint, bond, origin | — |
| Timber linear to cubic (timber-volume) | count | — |
| Paint coverage (paint-coverage) | openingArea, waste, canLitres | — |
| Plasterboard sheets (plasterboard) | materialDepth, cutKerf | — |
| Insulation batts (insulation-batts) | materialDepth, cutKerf | — |
| Wallpaper rolls (wallpaper-rolls) | trim, repeatLength, rollLead | — |
| Soil & mulch (soil-mulch) | density | — |
