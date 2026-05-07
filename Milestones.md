# Milestones:
## Base Retry engine
* Executes the task
* Detects failure (thrown/rejected promise)
* Retries up to configured attempts
* Waits between retries
* Returns success immediately when task succeeds
* Throws final error after exhausting attempts
* Works with TypeScript types

## Target

The following package should work for any promise-returning function
* API Calls
* DB Operations
* queue jobs
* file operations
* any promise-returning functions

## Input

1. Task
2. retry configuration

## Output

* Successfull on task completion
* Error if all attemps fail