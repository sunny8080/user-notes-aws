const NotesTable = process.env.NOTES_TABLE;
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, PutCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const uuid = require('uuid').v4;

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dbClient);

// @desc            Get all notes
// @route           GET /notes
// @access          Public
module.exports.getNotes = async (event) => {
  try {
    const input = {
      TableName: NotesTable,
    };
    const command = new ScanCommand(input);
    const result = await ddbDocClient.send(command);

    const response = {
      metadata: result.$metadata,
      count: result.Count,
      items: result.Items,
    };

    return sendResponse(response, 200);
  } catch (err) {
    return sendError(err.message, err.statusCode || 404);
  }
};

// @desc            Get all notes of a user by user_id
// @route           GET /notes/user/{user_id}
// @access          Public
module.exports.getNotesOfUser = async (event) => {
  try {
    const input = {
      TableName: NotesTable,
      KeyConditionExpression: '#user_id = :user_id',
      ExpressionAttributeNames: {
        '#user_id': 'user_id',
      },
      ExpressionAttributeValues: {
        ':user_id': event.pathParameters.user_id,
      },
    };
    const command = new QueryCommand(input);
    const result = await ddbDocClient.send(command);

    if (result.Count == 0) {
      return sendError('User not found', 404);
    }

    const response = {
      metadata: result.$metadata,
      count: result.Count,
      items: result.Items,
    };
    return sendResponse(response, 200);
  } catch (err) {
    return sendError(err.message, err.statusCode || 404);
  }
};

// @desc            Get a note
// @route           GET /notes/{id}
// @access          Public
module.exports.getNote = async (event) => {
  try {
    const note_id = event.pathParameters.id;

    const input = {
      TableName: NotesTable,
      IndexName: 'note_id-glo-index',
      KeyConditionExpression: 'note_id = :note_id_val',
      ExpressionAttributeValues: {
        ':note_id_val': note_id,
      },
    };

    const command = new QueryCommand(input);
    const result = await ddbDocClient.send(command);

    if (result.Count == 0) {
      return sendError('Note not found', 404);
    }

    const response = {
      metadata: result.$metadata,
      item: result?.Items[0],
    };
    return sendResponse(response, 200);
  } catch (err) {
    return sendError(err.message, err.statusCode || 404);
  }
};

// @desc            Create a note
// @route           POST /notes
// @access          Public
module.exports.createNote = async (event) => {
  try {
    const data = JSON.parse(event.body);
    if (!(data.user_id && data.user_name && data.title && data.body)) {
      return sendError('Some fields are missing', 404);
    }

    const input = {
      TableName: NotesTable,
      Item: {
        user_id: data.user_id,
        user_name: data.user_name,
        note_id: data.user_id + '-' + uuid(),
        timestamp: Date.now(),
        title: data.title,
        body: data.body,
      },
      ConditionExpression: 'attribute_not_exists(user_id)',
    };

    const command = new PutCommand(input);
    const result = await ddbDocClient.send(command);
    const response = {
      metadata: result.$metadata,
    };
    if (result.$metadata.httpStatusCode == 200) response.item = input.Item;
    return sendResponse(response, 201);
  } catch (err) {
    return sendError(err.message, err.statusCode || 404);
  }
};

// @desc            Update a note
// @route           PUT /notes/{id}
// @access          Public
module.exports.updateNote = async (event) => {
  try {
    const data = JSON.parse(event.body);
    if (!(data.title && data.body)) {
      return sendError('Some fields are missing', 404);
    }

    // Method 1 - first find and then update
    const note_id = event.pathParameters.id;
    const input1 = {
      TableName: NotesTable,
      IndexName: 'note_id-glo-index',
      KeyConditionExpression: 'note_id = :note_id_val',
      ExpressionAttributeValues: {
        ':note_id_val': note_id,
      },
    };

    const item = (await ddbDocClient.send(new QueryCommand(input1)))?.Items[0];
    if (!item) {
      return sendError('Note not found', 404);
    }

    const input = {
      TableName: NotesTable,
      Key: {
        user_id: item.user_id,
        timestamp: item.timestamp,
      },
      ConditionExpression: 'attribute_exists(user_id)',
      UpdateExpression: 'set #title = :title, #body = :body',
      ExpressionAttributeNames: {
        '#title': 'title',
        '#body': 'body',
      },
      ExpressionAttributeValues: {
        ':title': data.title,
        ':body': data.body,
      },
      ReturnValues: 'ALL_NEW',
    };

    const command = new UpdateCommand(input);
    const result = await ddbDocClient.send(command);

    const response = {
      metadata: result.$metadata,
      item: result.Attributes,
    };
    return sendResponse(response, 200);
  } catch (err) {
    return sendError(err.message, err.statusCode || 404);
  }
};

// @desc            Delete a note
// @route           DELETE /notes/{id}
// @access          Public
module.exports.deleteNote = async (event) => {
  try {
    const note_id = event.pathParameters.id;
    const input1 = {
      TableName: NotesTable,
      IndexName: 'note_id-glo-index',
      KeyConditionExpression: 'note_id = :note_id_val',
      ExpressionAttributeValues: {
        ':note_id_val': note_id,
      },
    };

    const item = (await ddbDocClient.send(new QueryCommand(input1)))?.Items[0];
    if (!item) {
      return sendError('Note not found', 404);
    }

    const input = {
      TableName: NotesTable,
      Key: {
        user_id: item.user_id,
        timestamp: item.timestamp,
      },
      ConditionExpression: 'attribute_exists(user_id)',
      ReturnValues: 'ALL_OLD',
    };

    const command = new DeleteCommand(input);
    const result = await ddbDocClient.send(command);

    const response = {
      metadata: result.$metadata,
      item: result.Attributes,
    };
    return sendResponse(response, 200);
  } catch (err) {
    return sendError(err.message, err.statusCode || 404);
  }
};

const sendError = (error, statusCode) => {
  return {
    statusCode: statusCode || 500,
    body: JSON.stringify(
      {
        statusCode: statusCode || 500,
        error: error || 'Server Error',
      },
      null,
      2
    ),
  };
};

const sendResponse = (data, statusCode) => {
  return {
    statusCode: statusCode || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(
      {
        statusCode: statusCode || 200,
        data,
      },
      null,
      2
    ),
  };
};
