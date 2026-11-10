import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'LANDLORD' | 'TENANT';
    } & DefaultSession['user'];
  }

  interface User {
    role: 'LANDLORD' | 'TENANT';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: 'LANDLORD' | 'TENANT';
  }
}
