package api

import (
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func NewRouter(h *Handler) *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/health", h.HealthCheck)

		r.Route("/files", func(r chi.Router) {
			r.Post("/register", h.RegisterFile)
			r.Get("/{fileID}", h.GetFile)
			r.Post("/{fileID}/chunks/{chunkID}/confirm", h.ConfirmChunk)
		})

		r.Route("/chunks", func(r chi.Router) {
			r.Post("/{chunkID}/corrupted", h.ReportCorruption)
		})

		r.Route("/nodes", func(r chi.Router) {
			r.Get("/", h.ListNodes)
			r.Post("/register", h.RegisterNode)
			r.Post("/{nodeID}/drain", h.DrainNode)
		})
	})

	return r
}
