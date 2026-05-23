'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  assignedToDisplay,
  safeAdoPathSegment,
  adoGuessWorkItemWebUrl,
  hierarchyForwardChildIds,
  isTestCaseType,
  shouldIncludeWorkItemType,
  completedWorkFromFields,
  workItemTreeNodeFromBody,
} = require('../server/adoWorkItemUtils')

describe('adoWorkItemUtils', () => {
  it('assignedToDisplay reads displayName and uniqueName', () => {
    assert.equal(assignedToDisplay('Jane Doe'), 'Jane Doe')
    assert.equal(assignedToDisplay({ displayName: 'Jane Doe' }), 'Jane Doe')
    assert.equal(assignedToDisplay({ uniqueName: 'jane@example.com' }), 'jane@example.com')
    assert.equal(assignedToDisplay(null), '')
  })

  it('safeAdoPathSegment rejects traversal and slashes', () => {
    assert.equal(safeAdoPathSegment('slb1-swt'), 'slb1-swt')
    assert.equal(safeAdoPathSegment('../evil'), '')
    assert.equal(safeAdoPathSegment('org/name'), '')
  })

  it('adoGuessWorkItemWebUrl builds dev.azure.com links', () => {
    assert.equal(
      adoGuessWorkItemWebUrl('slb1-swt', 'drillops-reporting', '2667072'),
      'https://dev.azure.com/slb1-swt/drillops-reporting/_workitems/edit/2667072',
    )
    assert.equal(
      adoGuessWorkItemWebUrl('slb1-swt', '', '2667072'),
      'https://dev.azure.com/slb1-swt/_workitems/edit/2667072',
    )
  })

  it('hierarchyForwardChildIds collects forward relation ids', () => {
    const ids = hierarchyForwardChildIds([
      { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://x/workItems/42' },
      { rel: 'System.LinkTypes.Related', url: 'https://x/workItems/99' },
    ])
    assert.deepEqual(ids, [42])
  })

  it('excludes test case work item types', () => {
    assert.equal(isTestCaseType('Test Case'), true)
    assert.equal(isTestCaseType('User Story'), false)
    assert.equal(shouldIncludeWorkItemType('Task'), true)
    assert.equal(shouldIncludeWorkItemType('Test Case'), false)
  })

  it('completedWorkFromFields parses numeric completed work', () => {
    assert.equal(
      completedWorkFromFields({ 'Microsoft.VSTS.Scheduling.CompletedWork': 4.5 }),
      4.5,
    )
    assert.equal(completedWorkFromFields({}), null)
    assert.equal(
      completedWorkFromFields({ 'Microsoft.VSTS.Scheduling.CompletedWork': 'bad' }),
      null,
    )
  })

  it('workItemTreeNodeFromBody maps ADO fields', () => {
    const node = workItemTreeNodeFromBody(
      {
        id: 2667072,
        fields: {
          'System.Id': 2667072,
          'System.WorkItemType': 'Requirement',
          'System.Title': 'Root item',
          'System.State': 'Active',
          'System.AssignedTo': { displayName: 'Alex' },
          'Microsoft.VSTS.Scheduling.CompletedWork': 0,
          'System.TeamProject': 'drillops-reporting',
        },
      },
      'slb1-swt',
    )
    assert.equal(node.id, 2667072)
    assert.equal(node.workItemType, 'Requirement')
    assert.equal(node.title, 'Root item')
    assert.equal(node.assignee, 'Alex')
    assert.match(node.webUrl, /2667072/)
    assert.deepEqual(node.children, [])
  })
})
