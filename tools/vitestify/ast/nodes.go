package ast

type nodeType = string

const (
	NODE_ARROW_FUNCTION         nodeType = "arrow_function"
	NODE_AWAIT_EXPRESSION       nodeType = "await_expression"
	NODE_CALL_EXPRESSION        nodeType = "call_expression"
	NODE_COMMENT                nodeType = "comment"
	NODE_EXPORT_CLAUSE          nodeType = "export_clause"
	NODE_EXPORT_SPECIFIER       nodeType = "export_specifier"
	NODE_EXPORT_STATEMENT       nodeType = "export_statement"
	NODE_EXPRESSION_STATEMENT   nodeType = "expression_statement"
	NODE_FUNCTION_DECLARATION   nodeType = "function_declaration"
	NODE_IDENTIFIER             nodeType = "identifier"
	NODE_IMPORT                 nodeType = "import"
	NODE_IMPORT_CLAUSE          nodeType = "import_clause"
	NODE_IMPORT_SPECIFIER       nodeType = "import_specifier"
	NODE_IMPORT_STATEMENT       nodeType = "import_statement"
	NODE_MEMBER_EXPRESSION      nodeType = "member_expression"
	NODE_NAMED_EXPORTS          nodeType = "named_exports"
	NODE_NAMED_IMPORTS          nodeType = "named_imports"
	NODE_NAMESPACE_EXPORT       nodeType = "namespace_export"
	NODE_NAMESPACE_IMPORT       nodeType = "namespace_import"
	NODE_NESTED_TYPE_IDENTIFIER nodeType = "nested_type_identifier"
	NODE_PROPERTY_IDENTIFIER    nodeType = "property_identifier"
	NODE_TYPE_ANNOTATION        nodeType = "type_annotation"
	NODE_VARIABLE_DECLARATOR    nodeType = "variable_declarator"
)

type fieldName = string

const (
	FIELD_ALIAS                fieldName = "alias"
	FIELD_FN_ARGUMENTS         fieldName = "arguments"
	FIELD_IMPORT_EXPORT_SOURCE fieldName = "source"
	FIELD_NAME                 fieldName = "name"
)

type keyword = string

const (
	KEYWORD_TYPE   keyword = "type"
	KEYWORD_TYPEOF keyword = "typeof"
)
