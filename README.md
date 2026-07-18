# Cordillera

A comprehensive Todo application built with the modern Next.js App Router. It features a complete stack utilizing Next.js, Tailwind CSS for styling, shadcn/ui for beautiful and accessible components, and Prisma ORM coupled with PostgreSQL for robust data management.

## Features

- **Manage Todos**: Create, read, update, and delete tasks.
- **User Assignment**: Assign todos to specific users.
- **Modern UI**: Clean and responsive interface built with Tailwind CSS and Radix UI components.
- **Database Integrated**: Persistent data storage using Prisma and PostgreSQL.

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- Node.js (version 18 or higher recommended)
- A running instance of PostgreSQL (or a provider like Neon, Supabase, etc.)

### Installation & Setup

1. **Install dependencies:**

   ```bash
   npm install
   # or
   pnpm install
   # or
   yarn install
   ```

2. **Environment Variables:**

   Create a `.env` file in the root directory and add your PostgreSQL database connection string:

   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/cordilleradb?schema=public"
   ```

3. **Database Setup:**

   Push the Prisma schema to your database to create the necessary tables:

   ```bash
   npm run db:push
   ```

   _Alternatively, if you're using migrations:_

   ```bash
   npm run db:migrate
   ```

4. **Generate Prisma Client:**

   _(This is usually run automatically during postinstall, but you can run it manually if needed)_

   ```bash
   npm run db:generate
   ```

5. **Start the Development Server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. The app automatically redirects to the `/todos` page.

## Technologies Used

- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Prisma](https://www.prisma.io/) - Next-generation Node.js and TypeScript ORM
- [Radix UI](https://www.radix-ui.com/) (shadcn/ui) - Unstyled, accessible UI components

## License

This project is private.
