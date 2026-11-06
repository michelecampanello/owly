import { createApp } from "./app.js";

const port = process.env.PORT ?? 3000;
createApp().listen(port, () => console.log(`Owly server su http://localhost:${port}`));
