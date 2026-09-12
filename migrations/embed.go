// Package migrations embeds the SQL migration files into the compiled
// binary so the API can apply them itself on startup.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
