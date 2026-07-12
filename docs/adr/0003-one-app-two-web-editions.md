# One Angular app, two web editions

The main Daily experience and Standalone Classic are built from one Angular application but emitted as separate production artifacts. This keeps gameplay, visuals, and accessibility fixes shared while allowing each edition to have its own routes, entry flow, access policy, and browser-local profile; the alternative of a second app or fork would create avoidable maintenance drift.
