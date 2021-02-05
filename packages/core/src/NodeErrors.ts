import {
	isEmpty,
} from 'lodash';

abstract class NodeError extends Error {
	description: string | null = null;
	cause: Error | JsonObject;
	timestamp: number;
	nodeType: string;
	descriptionIsArray = false;

	constructor(
		name: string,
		nodeType: string,
		error: Error | JsonObject,
		descriptionIsArray = false,
	) {
		super(name);
		this.cause = error;
		this.nodeType = nodeType;
		this.timestamp = new Date().getTime();
		this.descriptionIsArray = descriptionIsArray;
	}

	protected findValueRecursively(
		error: JsonObject,
		{ targetProperty }: { targetProperty: 'httpCode' | 'description' },
	): string | null {

		if (targetProperty === 'description' && this.descriptionIsArray) {
			const container = error as ErrorObjectsContainer;
			const errorObjects = container.response.body.error.errors;
			return errorObjects.map((error) => error.message).join('|');
		}

		const topLevelKeys = targetProperty === 'httpCode'
			? ERROR_CODE_PROPERTIES
			: ERROR_MESSAGE_PROPERTIES;
		const nestedKeys = ERROR_NESTED_PROPERTIES;

		for (const key of topLevelKeys) {
			const value = error[key];
			if (value) {
				if (typeof value === 'string') return value;
				if (typeof value === 'number') return value.toString();
			}
		}

		for (const key of nestedKeys) {
			const value = error[key];
			if (isJsonObject(value)) return this.findValueRecursively(value, { targetProperty });
		}

		return null;
	}
}

export class NodeOperationError extends NodeError {
	constructor(nodeType: string, error: Error | string) {
		if (typeof error === 'string') {
			error = new Error(error);
		}
		super('NodeOperationError', nodeType, error);
		this.message = `${nodeType}: ${error.message}`;
	}
}

export class NodeApiError extends NodeError {
	httpCode: string | null = null;

	constructor(
		nodeType: string,
		error: JsonObject,
		{ customDetails, descriptionIsArray }: NodeApiErrorConstructorArgs = {},
	) {
		super('NodeApiError', nodeType, error, descriptionIsArray);
		this.message = `${nodeType}: `;

		isEmpty(customDetails)
			? this.setFieldsFromError(error)
			: this.setFieldsFromCustomDetails(customDetails);
	}

	private setFieldsFromCustomDetails(
		{ httpCode, message, description }: CustomDetails = {}) {
		if (httpCode) this.httpCode = httpCode;
		if (message) this.message += message;
		if (description) {
			this.description = this.httpCode ? `${this.httpCode} - ${description}` : description;
		}
	}

	private setFieldsFromError(error: JsonObject) {
		this.httpCode = this.findValueRecursively(error, { targetProperty: 'httpCode' });
		this.description = this.findValueRecursively(error, { targetProperty: 'description' });
		this.message = this.findMessage();
	}

	private findMessage() {
		if (!this.httpCode) return STATUS_CODE_MESSAGES['UNKNOWN'];

		if (STATUS_CODE_MESSAGES[this.httpCode]) return STATUS_CODE_MESSAGES[this.httpCode];

		return this.httpCode.charAt(0) === '4'
			? STATUS_CODE_MESSAGES['4XX']
			: this.httpCode.charAt(0) === '5'
			? STATUS_CODE_MESSAGES['5XX']
			: STATUS_CODE_MESSAGES['UNKNOWN'];
	}

}

// -------------------------- typings -------------------------- //

type NodeApiErrorConstructorArgs = {
	customDetails?: {
		description?: string,
		httpCode?: string,
		message?: string,
	},
	descriptionIsArray?: boolean,
};

type CustomDetails = NodeApiErrorConstructorArgs['customDetails'];

type JsonObject = { [key: string]: JsonValue };

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| JsonObject;

type ErrorObjectsContainer = {
		response: {
			body: {
				error: {
					errors: Array<{ message: string }>;
				}
			}
		}
};

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && typeof value !== null && !Array.isArray(value);
}

// -------------------------- constants -------------------------- //

const ERROR_MESSAGE_PROPERTIES = [
	'message',
	'Message',
	'msg',
	'description',
	'reason',
	'detail',
	'details',
	'errorMessage',
	'ErrorMessage',
	'error_message',
	'_error_message',
	'errorDescription',
	'error_description',
	'error_summary',
	'title',
	'text',
	'error',
	'err',
	'type',
];

const ERROR_CODE_PROPERTIES = ['statusCode', 'status', 'code', 'status_code', 'errorCode', 'error_code'];

const ERROR_NESTED_PROPERTIES = ['error', 'err', 'response', 'body', 'data'];

// const MULTI_MESSAGE_PROPERTIES = ['messages'];
// const MULTI_NESTING_PROPERTIES = ['errors'];

const STATUS_CODE_MESSAGES: { [key: string]: string } = {
	'4XX': 'Your request is invalid or could not get processed by the service.',
	'400': 'Bad request - please check the payload of your request.',
	'401': 'Authorization failed - please check your credentials.',
	'402': 'Payment required - please check your payment details.',
	'403': 'Forbidden - please check your credentials.',
	'404': 'The resource you are requesting has not been found.',
	'405': 'Method not allowed - please check if you are using the right HTTP method.',
	'429': 'Too many requests - take a break! The service is receiving too many requests from you.',

	'5XX': 'The service failed to process your request - please try again later.',
	'500': 'The service was unable to process your request and returned an error.',
	'502': 'Bad gateway - the service failed to handle your request.',
	'503': 'Service unavailable - please try again later.',
	'504': 'Gateway timed out - please try again later.',

	'UNKNOWN': 'UNKNOWN ERROR - check the detailed error for more information.',
};