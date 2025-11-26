# Overview

This is a Customer Relationship Management (CRM) system (고객관리시스템). The application provides a comprehensive platform for managing customer information, consultation processes, and administrative tasks in a Korean business context.

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

## Google Sheets 연동 (외부 데이터 소스)

### 카팡 랜딩페이지 (CarPang)
- **Google Apps Script 배포 URL**: `https://script.google.com/macros/s/AKfycbwOg5qWDkf8s64CL2N8eGNKXpUSv8xuWucz1lJsAyD2qTjVliCA-K9iiR9o4MLmalKbFw/exec`
- **CRM API Endpoint**: `/api/survey/import`
- **API Key Name**: 카팡랜딩페이지
- **CRM 필드 매핑**:
  - info1: 차량명
  - info2: 렌트타입
  - info3: UTM Source
  - info4: UTM Medium
  - info5: UTM Campaign
  - info6: UTM Term
  - info7: UTM Content
  - memo1: 요약 정보

### 차량문의 (Facebook Lead Ads)
- **CRM API Endpoint**: `/api/car-inquiry/import`
- **API Key Name**: 카팡 잠재고객 API
- **CRM 필드 매핑**:
  - info1: 유형을_선택해주세요
  - info2: 희망차종
  - info3: adset_name

### 기타 연동
- **보험 리드**: `/api/survey/import` (보탐정 설문)
- **Secret sheet 리드**: `/api/survey/import`
- **개인회생 탕감액분석기**: `/api/survey/import`