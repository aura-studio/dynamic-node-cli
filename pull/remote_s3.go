package pull

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Remote is a pull source backed by S3.
type S3Remote struct {
	bucket string
	prefix string
}

// NewS3Remote parses a remote URL into bucket and prefix.
func NewS3Remote(remote string) *S3Remote {
	r := remote
	r = strings.TrimSpace(r)
	r = strings.TrimPrefix(r, "s3://")

	b := r
	p := ""
	if i := strings.IndexByte(b, '/'); i >= 0 {
		p = strings.Trim(b[i+1:], "/")
		b = b[:i]
	}

	return &S3Remote{bucket: b, prefix: p}
}

func (r *S3Remote) createS3Client(ctx context.Context) (*s3.Client, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create client: %w", err)
	}
	return s3.NewFromConfig(cfg), nil
}

type downloadTask struct {
	Key       string
	LocalPath string
}

// PullArtifacts downloads matching .zip artifacts from S3 to local warehouse.
func (r *S3Remote) PullArtifacts(env string, name string, localWarehouse string, opt Options) (int, error) {
	ctx := context.Background()
	client, err := r.createS3Client(ctx)
	if err != nil {
		return 0, err
	}

	remoteDir := path.Join(env, name)

	listPrefix := remoteDir
	if r.prefix != "" {
		listPrefix = path.Join(r.prefix, remoteDir)
	}

	keys, err := r.listMatchingKeys(ctx, client, listPrefix, name)
	if err != nil {
		return 0, err
	}
	if len(keys) == 0 {
		return 0, fmt.Errorf("no matching artifacts found under s3://%s/%s", r.bucket, listPrefix)
	}

	tasks := make([]downloadTask, 0, len(keys))
	for _, fullKey := range keys {
		relKey := fullKey
		if r.prefix != "" {
			prefixWithSlash := strings.Trim(r.prefix, "/") + "/"
			relKey = strings.TrimPrefix(fullKey, prefixWithSlash)
		}
		tasks = append(tasks, downloadTask{
			Key:       fullKey,
			LocalPath: filepath.Join(localWarehouse, filepath.FromSlash(relKey)),
		})
	}

	return r.downloadTasks(ctx, client, tasks, opt)
}

func (r *S3Remote) listMatchingKeys(ctx context.Context, client *s3.Client, listPrefix string, name string) ([]string, error) {
	libnodeName := fmt.Sprintf("libnode_%s.zip", name)

	p := s3.NewListObjectsV2Paginator(client, &s3.ListObjectsV2Input{
		Bucket: &r.bucket,
		Prefix: &listPrefix,
	})

	var keys []string
	for p.HasMorePages() {
		page, err := p.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("list objects: %w", err)
		}
		for _, obj := range page.Contents {
			if obj.Key == nil {
				continue
			}
			key := *obj.Key
			base := path.Base(key)
			// Pull only primary artifacts (no timestamp suffix backups).
			if base == libnodeName {
				keys = append(keys, key)
			}
		}
	}
	return keys, nil
}

func (r *S3Remote) downloadTasks(ctx context.Context, client *s3.Client, tasks []downloadTask, opt Options) (int, error) {
	if opt.Concurrency <= 0 {
		opt.Concurrency = 8
	}

	var (
		wg      sync.WaitGroup
		jobs    = make(chan downloadTask)
		errMu   sync.Mutex
		errList []error
		success int
		succMu  sync.Mutex
	)

	worker := func() {
		defer wg.Done()
		for task := range jobs {
			if !opt.Force {
				if _, statErr := os.Stat(task.LocalPath); statErr == nil {
					succMu.Lock()
					success++
					succMu.Unlock()
					continue
				}
			}

			if err := os.MkdirAll(filepath.Dir(task.LocalPath), 0o755); err != nil {
				errMu.Lock()
				errList = append(errList, fmt.Errorf("mkdir %q: %w", filepath.Dir(task.LocalPath), err))
				errMu.Unlock()
				continue
			}

			if err := r.downloadOne(ctx, client, task.Key, task.LocalPath); err != nil {
				errMu.Lock()
				errList = append(errList, err)
				errMu.Unlock()
				continue
			}

			succMu.Lock()
			success++
			succMu.Unlock()
		}
	}

	wg.Add(opt.Concurrency)
	for i := 0; i < opt.Concurrency; i++ {
		go worker()
	}
	for _, t := range tasks {
		jobs <- t
	}
	close(jobs)
	wg.Wait()

	if len(errList) > 0 {
		return success, joinErrors(errList)
	}
	return success, nil
}

func (r *S3Remote) downloadOne(ctx context.Context, client *s3.Client, key string, localPath string) error {
	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: &r.bucket,
		Key:    &key,
	})
	if err != nil {
		return fmt.Errorf("get s3://%s/%s: %w", r.bucket, key, err)
	}
	defer out.Body.Close()

	dir := filepath.Dir(localPath)
	base := filepath.Base(localPath)
	tmp, err := os.CreateTemp(dir, base+".tmp.*")
	if err != nil {
		return fmt.Errorf("create temp file in %q: %w", dir, err)
	}
	tmpName := tmp.Name()
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
	}()

	if _, err := io.Copy(tmp, out.Body); err != nil {
		return fmt.Errorf("write %q: %w", tmpName, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close %q: %w", tmpName, err)
	}

	if err := os.Rename(tmpName, localPath); err != nil {
		return fmt.Errorf("rename %q -> %q: %w", tmpName, localPath, err)
	}

	return nil
}

func joinErrors(errs []error) error {
	if len(errs) == 0 {
		return nil
	}
	if len(errs) == 1 {
		return errs[0]
	}
	b := strings.Builder{}
	b.WriteString("multiple errors:")
	for _, e := range errs {
		if e == nil {
			continue
		}
		b.WriteString("\n - ")
		b.WriteString(e.Error())
	}
	return errors.New(b.String())
}
