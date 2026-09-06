# Hatsune Miku

Character: © Crypton Future Media, INC. Character design by KEI.

Base mesh: **Animasa (あにまさ), Hatsune Miku v2.3**, the classic bundled
MikuMikuDance model, distributed with the Three.js r171 MMD examples.

Source: https://github.com/mrdoob/three.js/tree/r171/examples/models/mmd/miku

The original PMD, eye texture (losslessly converted from BMP to PNG), and
original distribution readme are retained in this directory. The model is
not covered by the Three.js code license. Follow the character usage guidelines:
https://piapro.net/intl/en_for_creators.html

Viewer adaptation: converted to glTF, curved midpoint subdivision for hair,
skin and clothing, adjusted materials, a stationary portrait pose, and
spring-bone twin-tail physics driven by orbit gestures. This is a fan-made study using the classic MMD
mesh, not an extracted Project DIVA game asset or an exact scan of the references.

Rebuild the adapted mesh: `node scripts/build-miku-model.mjs`.
