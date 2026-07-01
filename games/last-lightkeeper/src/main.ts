// Browser composition root. Wire renderer, audio, input, store, and the
// game loop here using @automata/engine and @automata/game-kit.
const app = document.getElementById('app')
if (!app) throw new Error('Missing #app')
