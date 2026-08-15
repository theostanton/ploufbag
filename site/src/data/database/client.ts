// Re-export database functionality from common package
export { 
  getDatabase, 
  getPool, 
  withPooledClient, 
  closeAllConnections,
  type Client 
} from '@ploufbag/common';