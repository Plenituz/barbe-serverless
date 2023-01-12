local barbe = std.extVar("barbe");

barbe.pipelines([{
    apply: [
        function(container) barbe.databags([
            barbe.importComponent(
                container,
                "default_terraform",
                "https://hub.barbe.app/barbe-serverless/terraform_execute/v0.1.0/.jsonnet",
                [],
                [{
                    Type: "terraform_execute",
                    Name: "default_apply",
                    Value: {
                        display_name: "Terraform apply - root directory",
                        mode: "apply",
                        dir: std.extVar("barbe_output_dir"),
                    }
                }]
            ),
        ]),
    ],
    destroy: [
        function(container) barbe.databags([
            barbe.importComponent(
                container,
                "default_terraform",
                "https://hub.barbe.app/barbe-serverless/terraform_execute/v0.1.0/.jsonnet",
                [],
                [{
                    Type: "terraform_execute",
                    Name: "default_destroy",
                    Value: {
                        display_name: "Terraform destroy - root directory",
                        mode: "destroy",
                        dir: std.extVar("barbe_output_dir"),
                    }
                }]
            ),
        ]),
    ]
}])