# I-Dash Frontend - Quick Start

## Installation (2 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev
```

Open http://localhost:3000 in your browser.

## Login Credentials

Use demo login button on login page:
- Email: demo@example.com
- Password: demo123456

## Available Routes

- `/` → Redirects to `/dashboard`
- `/login` → Login page
- `/dashboard` → Main dashboard
- `/dashboard/marketing` → Marketing metrics
- `/dashboard/sales` → Sales pipeline
- `/dashboard/executive` → Executive overview
- `/dashboard/pipelines` → Pipeline management
- `/settings` → User settings

## Build for Production

```bash
npm run build
npm run preview
```

## File Structure Quick Reference

```
src/
├── App.jsx                    # Router & providers
├── index.jsx                  # Entry point
├── index.css                  # Global styles
├── components/
│   ├── auth/LoginPage.jsx    # Login
│   └── layout/               # Sidebar, Header, Layout
├── context/AuthContext.jsx   # Auth state
├── hooks/                     # useApi, useDashboard
├── pages/                     # Dashboard pages
└── services/api.js           # API client
```

## Key Features

✓ Dark theme with vibrant colors
✓ Glassmorphism effects
✓ Smooth animations
✓ Responsive design
✓ Multiple dashboards
✓ Data visualization
✓ User authentication
✓ Settings management

## Customize Theme

Edit `tailwind.config.js`:
```js
colors: {
  primary: '#YOUR_COLOR',
  secondary: '#YOUR_COLOR',
  // ...
}
```

## API Configuration

Edit `.env`:
```
VITE_API_URL=http://your-backend-url/api
```

## Common Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Need Help?

1. Read `SETUP.md` for detailed guide
2. Check browser console for errors
3. Verify backend is running
4. Check `.env` configuration

---

Built with React, Vite, Tailwind CSS, and Framer Motion.
