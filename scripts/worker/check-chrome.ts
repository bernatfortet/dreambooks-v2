#!/usr/bin/env bunx tsx

/**
 * Check if Chrome is running with remote debugging enabled on port 9222.
 */

const CDP_URL = 'http://localhost:9222'

async function checkChrome(): Promise<void> {
  console.log('Checking Chrome remote debugging status...')
  console.log('')

  try {
    const response = await fetch(`${CDP_URL}/json/version`, {
      signal: AbortSignal.timeout(3000),
    })

    if (response.ok) {
      const data = await response.json()
      console.log('✅ Chrome is running with remote debugging enabled')
      console.log(`   Browser: ${data.Browser || 'Unknown'}`)
      console.log(`   Protocol: ${data['Protocol-Version'] || 'Unknown'}`)
      console.log(`   User-Agent: ${data['User-Agent'] || 'Unknown'}`)
      console.log('')
      console.log('You can start the worker with: bun worker')
      process.exit(0)
    } else {
      console.error('❌ Chrome remote debugging is not accessible')
      console.error(`   Status: ${response.status} ${response.statusText}`)
      process.exit(1)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('❌ Connection timeout - Chrome remote debugging is not running')
    } else if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      console.error('❌ Connection refused - Chrome remote debugging is not running')
    } else {
      console.error('❌ Error checking Chrome status:', error)
    }
    console.error('')
    console.error('To start Chrome with remote debugging, run:')
    console.error('  bun run google')
    console.error('')
    console.error('Or manually:')
    console.error(
      '  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile'
    )
    process.exit(1)
  }
}

checkChrome()
