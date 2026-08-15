// Re-export database functionality from common package
export { 
  getDatabase, 
  getPool, 
  withPooledClient, 
  setTestClient as setClient, 
  closeAllConnections as end,
  type Client 
} from '@ploufbag/common';