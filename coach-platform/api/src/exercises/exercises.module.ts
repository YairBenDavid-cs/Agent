import { Module } from '@nestjs/common';
import { ExerciseResolverService } from './application/exercise-resolver.service';

/**
 * The exercise identity backbone. The catalog is a static in-memory model, so
 * this module has no persistence — it only provides and exports the resolver
 * service that other bounded contexts (personalization, future generator,
 * ingestion) depend on for canonical exercise ids.
 */
@Module({
  providers: [ExerciseResolverService],
  exports: [ExerciseResolverService],
})
export class ExercisesModule {}
