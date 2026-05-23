'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  adoStateCategory,
  adoWiIconKind,
  parseWorkItemFromUserInput,
  sumChildTaskCompletedHours,
  displayCompletedHours,
} = require('../client/shared.js')

describe('AdoWorkItemShared', () => {
  it('adoStateCategory maps states to dot colors', () => {
    assert.equal(adoStateCategory('Resolved'), 'resolved')
    assert.equal(adoStateCategory('Closed'), 'closed')
    assert.equal(adoStateCategory('New'), 'new')
    assert.equal(adoStateCategory('Active'), 'active')
    assert.equal(adoStateCategory('Unknown'), 'other')
  })

  it('adoWiIconKind maps work item types to icon classes', () => {
    assert.equal(adoWiIconKind('Requirement'), 'requirement')
    assert.equal(adoWiIconKind('Initiative'), 'initiative')
    assert.equal(adoWiIconKind('User Story'), 'user-story')
    assert.equal(adoWiIconKind('Task'), 'task')
    assert.equal(adoWiIconKind('Bug'), 'bug')
    assert.equal(adoWiIconKind('Feature'), 'default')
  })

  it('parseWorkItemFromUserInput parses id, URL, and org/project', () => {
    assert.deepEqual(parseWorkItemFromUserInput('2667072'), {
      id: '2667072',
      org: '',
      project: '',
    })
    assert.deepEqual(
      parseWorkItemFromUserInput(
        'https://dev.azure.com/slb1-swt/drillops-reporting/_workitems/edit/2667072',
      ),
      { id: '2667072', org: 'slb1-swt', project: 'drillops-reporting' },
    )
    assert.deepEqual(parseWorkItemFromUserInput(''), { id: '', org: '', project: '' })
  })

  it('sumChildTaskCompletedHours sums only child task hours', () => {
    const tree = {
      workItemType: 'Requirement',
      completedWork: 99,
      children: [
        {
          workItemType: 'Task',
          completedWork: 2,
          children: [{ workItemType: 'Task', completedWork: 3, children: [] }],
        },
        { workItemType: 'User Story', completedWork: 5, children: [] },
      ],
    }
    assert.equal(sumChildTaskCompletedHours(tree), 5)
  })

  it('displayCompletedHours shows task hours directly and rollups in parentheses', () => {
    assert.equal(
      displayCompletedHours({ workItemType: 'Task', completedWork: 4.5, children: [] }),
      '4.5',
    )
    assert.equal(
      displayCompletedHours({ workItemType: 'Task', completedWork: null, children: [] }),
      '—',
    )
    const story = {
      workItemType: 'User Story',
      completedWork: 99,
      children: [
        { workItemType: 'Task', completedWork: 2, children: [] },
        { workItemType: 'Task', completedWork: 3, children: [] },
      ],
    }
    assert.equal(displayCompletedHours(story), '(5)')
    const requirement = {
      workItemType: 'Requirement',
      children: [
        {
          workItemType: 'User Story',
          children: [{ workItemType: 'Task', completedWork: 4, children: [] }],
        },
      ],
    }
    assert.equal(displayCompletedHours(requirement), '(4)')
    assert.equal(
      displayCompletedHours({ workItemType: 'Requirement', children: [] }),
      '(—)',
    )
  })
})
