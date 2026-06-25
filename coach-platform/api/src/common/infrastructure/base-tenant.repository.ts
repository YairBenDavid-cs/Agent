import { FilterQuery, Model, PipelineStage, UpdateQuery } from 'mongoose';

/**
 * Base for every persistence adapter in a multi-tenant collection.
 *
 * Isolation is the #1 requirement, so it is enforced structurally: every query
 * helper here REQUIRES a userId and injects `user_id` into the Mongo filter. A
 * concrete repository cannot accidentally read across tenants by forgetting the
 * key — there is no helper that omits it.
 *
 * For context-specific aggregations, use `tenantPipeline`, which prepends a
 * `$match` on `user_id` so the very first stage is always tenant-scoped.
 */
export abstract class BaseTenantRepository<TDoc> {
  protected constructor(protected readonly model: Model<TDoc>) {}

  private requireUser(userId: string): void {
    if (!userId) {
      throw new Error(
        'userId is required for every tenant-scoped repository operation.',
      );
    }
  }

  protected scoped(
    userId: string,
    filter: FilterQuery<TDoc> = {},
  ): FilterQuery<TDoc> {
    this.requireUser(userId);
    return { ...filter, user_id: userId } as FilterQuery<TDoc>;
  }

  protected async findOneScoped(
    userId: string,
    filter: FilterQuery<TDoc>,
  ): Promise<TDoc | null> {
    return this.model.findOne(this.scoped(userId, filter)).lean<TDoc>().exec();
  }

  protected async findManyScoped(
    userId: string,
    filter: FilterQuery<TDoc>,
    sort: Record<string, 1 | -1>,
    limit?: number,
  ): Promise<TDoc[]> {
    const query = this.model
      .find(this.scoped(userId, filter))
      .sort(sort)
      .lean<TDoc[]>();
    if (limit) {
      query.limit(limit);
    }
    return query.exec();
  }

  protected async upsertScoped(
    userId: string,
    filter: FilterQuery<TDoc>,
    update: UpdateQuery<TDoc>,
  ): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, filter), update, { upsert: true })
      .exec();
  }

  /** Prepends a tenant `$match`; callers add the rest of the pipeline. */
  protected tenantPipeline(
    userId: string,
    stages: PipelineStage[],
  ): PipelineStage[] {
    this.requireUser(userId);
    return [{ $match: { user_id: userId } }, ...stages];
  }
}
