# I-Dash Frontend Setup Guide

## Overview

I-Dash is a premium enterprise analytics dashboard built with React, Vite, and Tailwind CSS. It features a modern dark theme with vibrant accent colors, smooth animations, and glassmorphism effects.

## Prerequisites

- Node.js 18.x or higher
- npm or yarn package manager

## Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Create environment file:**
```bash
cp .env.example .env
```

3. **Update .env with your backend API URL:**
```
VITE_API_URL=http://localhost:8000/api
```

## Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Development Features
- Fast refresh with Vite
- Hot module replacement
- Tailwind CSS JIT compilation
- Automatic API proxy to backend

## Build

Create a production build:

```bash
npm run build
```

Output will be in the `dist/` directory.

## Preview

Preview the production build locally:

```bash
npm run preview
```

## Project Structure

```
frontend/
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── components/         # React components
│   │   ├── auth/          # Authentication components
│   │   └── layout/        # Layout components (Sidebar, Header, Layout)
│   ├── context/           # React Context (Auth)
│   ├── hooks/             # Custom hooks (useApi, useDashboard)
│   ├── pages/             # Page components
│   ├── services/          # API service (axios client)
│   ├── App.jsx            # Root component
│   ├── index.jsx          # Entry point
│   └── index.css          # Global styles
├── .env                   # Environment variables
├── package.json           # Dependencies
├── tailwind.config.js     # Tailwind configuration
├── vite.config.js         # Vite configuration
└── postcss.config.js      # PostCSS configuration
```

## Technology Stack

### Core
- **React** 18.2 - UI framework
- **React Router** 6.20 - Client-side routing
- **Vite** 5.0 - Build tool and dev server

### State & Data
- **Axios** 1.6 - HTTP client
- **React Context** - State management
- **react-hot-toast** - Notifications

### UI & Styling
- **Tailwind CSS** 3.3 - Utility-first CSS
- **@tailwindcss/forms** - Form styling
- **Lucide React** - Icon library
- **Framer Motion** - Animations

### Data Visualization
- **Recharts** 2.10 - Charts and graphs

### Utilities
- **date-fns** 2.30 - Date manipulation
- **clsx** 2.0 - Class name utilities
- **@headlessui/react** - Unstyled UI components

## Key Features

### Authentication
- Login/logout system
- JWT token management
- Auto-token refresh
- Protected routes
- Role-based access control

### Layouts
- Responsive sidebar with collapse animation
- Premium header with date range picker
- Auto-refresh button
- User menu and notifications
- Mobile-responsive design

### Dashboards
- **Main Dashboard** - Overview and KPIs
- **Marketing Dashboard** - Campaign performance
- **Sales Dashboard** - Pipeline and forecasting
- **Executive Dashboard** - Strategic metrics
- **Pipelines** - Deal management

### Components
- Reusable stat cards with trends
- Multiple chart types (area, bar, line, pie)
- Data tables
- Settings pages
- Modal dialogs
- Toast notifications

## Styling System

### Color Palette
- **Primary**: Electric Blue (#3B82F6)
- **Secondary**: Violet (#8B5CF6)
- **Accent**: Emerald (#10B981)
- **Warning**: Amber (#F59E0B)
- **Danger**: Rose (#F43F5E)

### Utility Classes
- `.glass` - Glassmorphism effect
- `.card` - Card styling
- `.btn-primary` - Primary button
- `.input-field` - Form input
- `.badge-*` - Badge styles
- `.gradient-text` - Gradient text

## API Integration

The app connects to the backend API at `VITE_API_URL`. Key endpoints:

### Auth
- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/logout`
- `POST /auth/refresh`

### Dashboard
- `GET /dashboard/overview`
- `GET /dashboard/scorecards`
- `GET /dashboard/revenue`
- `GET /dashboard/ads`
- `GET /dashboard/hubspot`
- `GET /dashboard/marketing`
- `GET /dashboard/sales`
- `GET /dashboard/executive`

### Pipelines
- `GET /pipelines`
- `POST /pipelines`
- `GET /pipelines/:id`
- `PUT /pipelines/:id`
- `DELETE /pipelines/:id`

See `src/services/api.js` for complete API client.

## Customization

### Theme Colors
Edit `tailwind.config.js` to change color palette:
```js
colors: {
  primary: { ... },
  secondary: { ... },
  // etc
}
```

### Animations
Modify keyframes in `tailwind.config.js` or `src/index.css`

### Components
All components are in `src/components/` and use:
- Framer Motion for animations
- Lucide React for icons
- Recharts for data visualization
- Tailwind CSS for styling

## Performance Optimization

- Code splitting via React Router
- Image optimization
- CSS purging in production
- Lazy loading components
- Memoization where needed

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Troubleshooting

### Port Already in Use
```bash
npm run dev -- --port 3001
```

### API Connection Issues
- Check `.env` has correct `VITE_API_URL`
- Ensure backend is running
- Check browser console for CORS errors

### Styling Issues
```bash
npm run dev  # Clears Tailwind cache
```

### Module Not Found
```bash
rm -rf node_modules package-lock.json
npm install
```

## Development Tips

1. Use browser DevTools React plugin
2. Check console for warnings/errors
3. Test responsive design in DevTools
4. Use Git for version control
5. Test all routes and interactions
6. Validate forms before submission
7. Handle loading and error states

## Production Deployment

1. Build the project:
```bash
npm run build
```

2. Deploy `dist/` folder to:
   - Vercel
   - Netlify
   - AWS S3 + CloudFront
   - Your own server

3. Set environment variables on hosting platform:
```
VITE_API_URL=https://api.yourdomain.com/api
```

## Support & Documentation

For issues or questions:
1. Check browser console
2. Review API error responses
3. Test with demo credentials
4. Check environment variables

## License

© 2024 I-Dash. All rights reserved.
