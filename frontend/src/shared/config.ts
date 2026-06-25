// Frontend-only mode toggle.
//
// While there is no auth/assistant backend wired up, the app runs against local
// mocks so the full login -> dashboard flow works standalone. Set
// VITE_MOCK_API=false in .env to call the real coach-platform API instead.
export const MOCK_API: boolean = import.meta.env.VITE_MOCK_API !== 'false';
