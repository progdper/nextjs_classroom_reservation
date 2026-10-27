import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { getPrismaDatasourceUrl } from './src/lib/prisma-tls';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

// Generation/build need no database. Migration commands require DIRECT_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: getPrismaDatasourceUrl(process.env.DIRECT_URL),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL
      ? getPrismaDatasourceUrl(
          process.env.SHADOW_DATABASE_URL,
          'SHADOW_DATABASE_URL',
        )
      : undefined,
  },
});
