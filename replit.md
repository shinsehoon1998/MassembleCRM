# Overview

This is a Customer Relationship Management (CRM) system built specifically for personal bankruptcy consultation services (개인회생 상담). The application provides a comprehensive platform for managing customer information, consultation processes, and administrative tasks in a Korean business context.

The system features a modern web interface built with React and TypeScript on the frontend, with a Node.js/Express backend utilizing PostgreSQL for data persistence. It's designed to handle the complete customer lifecycle from initial intake through consultation completion.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens for Korean CRM aesthetics
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Authentication**: Replit Auth integration with OpenID Connect
- **Session Management**: Express sessions with PostgreSQL storage

## Database Design
- **Primary Database**: PostgreSQL (Neon serverless)
- **Schema Management**: Drizzle Kit for migrations and schema evolution
- **Key Tables**:
  - Users: Staff members with role-based access (admin, manager, counselor)
  - Customers: Customer information with Korean-specific fields
  - Consultations: Consultation records and progress tracking
  - Activity Logs: Audit trail for system actions
  - Sessions: Authentication session storage

## Authentication & Authorization
- **Primary Auth**: Replit Auth with OIDC integration
- **Session Storage**: PostgreSQL-backed session store
- **User Management**: Role-based access control with three tiers
- **Security**: HTTP-only cookies, CSRF protection, secure session handling

## External Dependencies

### Core Infrastructure
- **Database**: Neon PostgreSQL serverless database
- **Authentication**: Replit Auth service for user authentication
- **File Storage**: Google Cloud Storage for document and file uploads
- **Session Store**: PostgreSQL-based session persistence

### Development & Build Tools
- **Build System**: Vite for fast development and optimized production builds
- **Code Quality**: TypeScript for type safety across the entire stack
- **Development Environment**: Replit-specific plugins and error handling

### UI & User Experience
- **Component Library**: Radix UI primitives for accessible components
- **File Upload**: Uppy.js with AWS S3 integration for file handling
- **Data Visualization**: Chart.js for dashboard analytics and reporting
- **Date Handling**: date-fns library with Korean locale support
- **Form Validation**: Zod for runtime type validation and schema enforcement

### Monitoring & Development
- **Error Tracking**: Runtime error overlay for development
- **Code Navigation**: Cartographer plugin for Replit environment
- **Hot Reloading**: Vite HMR for rapid development cycles