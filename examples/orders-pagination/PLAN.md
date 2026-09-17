# Plan
1. Validate `limit` and `offset` only when supplied.
2. Filter by status as today.
3. Apply `slice(offset, offset + limit)` with defaults.
4. Add tests for default compatibility, ordering, limit, offset, filter-before-page and invalid values.
