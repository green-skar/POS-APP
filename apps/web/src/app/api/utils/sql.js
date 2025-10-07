import { db } from '../../../../lib/database.js';

// SQLite query function that mimics the Neon API
const sql = (query, params = []) => {
  try {
    let processedQuery;
    let values;
    
    if (typeof query === 'string') {
      processedQuery = query;
      values = params;
    } else if (Array.isArray(query)) {
      // Handle template literal queries (tagged template literals)
      processedQuery = query[0];
      values = query.slice(1);
      
      // Replace $1, $2, etc. with ? for SQLite
      let paramIndex = 1;
      values.forEach(() => {
        processedQuery = processedQuery.replace(`$${paramIndex}`, '?');
        paramIndex++;
      });
    }
    
    const stmt = db.prepare(processedQuery);
    
    // Determine if this is a SELECT query or INSERT/UPDATE/DELETE
    const queryType = processedQuery.trim().toUpperCase();
    const isSelectQuery = queryType.startsWith('SELECT') || 
                         queryType.startsWith('WITH') ||
                         queryType.startsWith('PRAGMA');
    
    if (isSelectQuery) {
      // Use .all() for SELECT queries
      if (values && values.length > 0) {
        return stmt.all(...values);
      } else {
        return stmt.all();
      }
    } else {
      // Use .run() for INSERT/UPDATE/DELETE queries
      if (values && values.length > 0) {
        return stmt.run(...values);
      } else {
        return stmt.run();
      }
    }
  } catch (error) {
    console.error('SQL Error:', error);
    throw error;
  }
};

// Add transaction support
sql.transaction = (queries) => {
  const transaction = db.transaction(() => {
    const results = [];
    for (const query of queries) {
      if (typeof query === 'function') {
        results.push(query(sql));
      } else {
        results.push(sql(query.query, query.params));
      }
    }
    return results;
  });
  return transaction();
};

export default sql;