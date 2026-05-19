package pull

import (
	"log"
	"net/url"
)

// Remote is the interface for pull sources.
type Remote interface {
	PullArtifacts(env string, name string, localWarehouse string, opt Options) (int, error)
}

func newRemote(s string) Remote {
	u, err := url.Parse(s)
	if err != nil {
		log.Panicf("pull: parsing remote url error: %v", err)
	}

	switch u.Scheme {
	case "", "s3":
		return NewS3Remote(s)
	default:
		log.Panicf("pull: unknown remote scheme: %s", u.Scheme)
	}

	return nil
}
