# Documents 0.3.1

## 0.3.2 — shared interface language (unreleased)

Follows the language saved in Core Settings, including changes to open views. Supports English, Spanish, Brazilian Portuguese, French and German with offline catalogs. Core owns the first-run choice; plugin content and identifiers stay literal. Requires Core 0.7.17 or newer. Publish a newly signed package and matching catalog minimum only after the Core release; existing release assets remain unchanged.

AI suggestions now keep streaming through pauses before the first word and between chunks. Expand, Fix grammar and the other writing actions no longer stall when the model briefly has no output. Stop also cancels work while a model is preparing or waiting for another request, and errors leave the controls ready to retry.

Writing status distinguishes waiting, generating, stopped, failed and completed work. Suggestions still require Apply before changing the document, and newer manual edits are protected.

Buttons now use consistent typography, padding, rounded corners and subtle gradients, including the writing toolbar, import/export, Apply/Discard and delete controls. The layout fits narrow windows without clipping the controls.

Use KAI Core Beta 0.7.9 or later for the matching model queue, cancellation and preparation fixes. Saved documents remain in the existing plugin data folder.
