# Multi-model product rig

A reference architecture for a site that has to carry **several** 3D products —
the HVAC case, but the shape of the problem is the same for any catalogue.

```
hvac/
└── index.html    one file: three products, one renderer, a live frame budget
```

Open it in a browser. Drag the condenser to orbit. Scroll to the cards and watch
the badges flip from **Queued** to **Live** as each scene is built.

## The point

The burger project had one object. Everything about it — one scene, one camera,
build it all at load — stops working at three. What changes:

| | One product | Several products |
|---|---|---|
| Contexts | 1 canvas | still **1** — a canvas per card dies at the fourth card |
| Scenes | 1 | one per product, independently disposable |
| Build | at load | on approach, or the page is four seconds of white |
| Cameras | 1 | one per *view*, not per product — the hero and a card share a scene |
| Teardown | never | explicit; GPU memory is not garbage collected |

### One context, many views

Browsers cap live WebGL contexts somewhere around 8–16 and silently kill the
oldest when you pass it. So each card is not a canvas — it is a **rectangle of
one canvas**, drawn with `setViewport` + `setScissor` at the element's screen
rect. Four views, one context, and adding a fifth costs nothing structural.

```js
var r = view.el.getBoundingClientRect();
renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
renderer.setScissor (r.left, H - r.bottom, r.width, r.height);
renderer.setScissorTest(true);
renderer.render(scene, view.cam);
```

### Built on approach, not at load

`renderViews()` calls `buildScene(id)` the first time a view is close enough to
draw. Below the fold, a product does not exist. That is why the hero reports one
scene built and the cards section reports three.

### Framing solved, not guessed

`frameObject()` sizes the camera distance from the object's bounding **sphere**,
against whichever of the horizontal or vertical field is tighter. Two things this
buys: hand-tuned camera distances stop being wrong when the viewport changes
shape, and a swapped-in model of unknown scale frames itself.

### The frame budget is on screen

The HUD is not decoration — it is the argument. Contexts, scenes resident, draw
calls, triangles, geometries, textures, ms/frame, views drawn. `renderer.info`
resets per `render()` call by default, so it is accumulated manually across all
four views to give real totals.

Current cost, all three products resident and three views drawing:

| | |
|---|---:|
| WebGL contexts | 1 |
| Draw calls / frame | ~98 |
| Triangles / frame | ~25k |
| Textures | 3 |

## The models

All three are procedural — folded panels, arrayed fins, turned collars, swept
tube. Hard-surface equipment is *easier* this way than organic shapes: a
condenser is boxes and repetition, and repetition is what an `InstancedMesh` is
for. The coil is 288 fins in one draw call.

- **MX-40 Condenser** — coil on three faces, fan guard, blades, service panel,
  line set
- **AH-22 Air Handler** — cabinet, twin doors, louvre bank, plenum collar, flue
- **WS-9 Wall Head** — extruded profile, motorised louver, display, line drop

A `panel()` helper builds every folded sheet: a rounded, bevelled slab. The
chamfer is what makes a box read as manufactured metal rather than a primitive —
it catches a highlight along every edge.

## Swapping in real geometry

Procedural units are a **stand-in**. For a real client you want the
manufacturer's own geometry, and the rig is built to take it:

```js
__rig.load('condenser', '/models/mx40.glb');
```

Everything downstream is unchanged — framing, lighting, the viewport rig, the
budget HUD. Add `GLTFLoader` alongside three.js:

```html
<script src="https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
```

For production geometry: Draco or meshopt on the meshes, KTX2/Basis on the
textures, and one LOD step if the same model appears both hero-size and
card-size.

**Where real models come from.** Most HVAC manufacturers publish BIM/Revit
families and 3D CAD for their equipment — that is the right source for a
client's actual product line, not a modeller and not an AI tool. Worth checking
the manufacturer's own resources before commissioning anything.

## Console

`__rig` exposes the working parts:

| | |
|---|---|
| `__rig.info()` | the current budget as an object |
| `__rig.build(id)` | force a scene to build |
| `__rig.dispose(id)` | tear one down and release its GPU memory |
| `__rig.load(id, url)` | swap in a GLB |
| `__rig.scenes` / `.views` / `.products` | the live registries |

## Query flags

| | |
|---|---|
| `?q=low` | halve the quality tier |
| `?dpr=1` | cap device pixel ratio |
| `?adapt=0` | freeze the adaptive resolution governor |
| `?nogl=1` | exercise the no-WebGL fallback |

## Honest limits

- The lighting is a procedural studio environment (a canvas equirect pushed
  through `PMREMGenerator`). It is good enough that brushed aluminium reads as
  metal; a real product page would use an HDRI.
- Contact shadows are a gradient plane, not shadow maps — steadier and far
  cheaper with four viewports drawing every frame, but they do not respond to
  the object's actual silhouette.
- The three units are generic. They are not any manufacturer's product and
  should not be presented as one.
